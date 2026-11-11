import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import argon2 from 'argon2';
import request from 'supertest';
import { Pool } from 'pg';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { bootTestApi } from '../../helpers/test-api';
import { FakeEmailSender } from '../../helpers/fake-email-sender';

describe('vendor registration and email verification', () => {
  let app: NestExpressApplication;
  let emailSender: FakeEmailSender;
  let pool: Pool;

  beforeAll(async () => {
    emailSender = new FakeEmailSender();
    app = await bootTestApi(emailSender);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  it('creates a pending vendor, stores only an Argon2id password hash, and verifies email with a one-use code', async () => {
    const email = `Vendor-${randomUUID()}@example.test`;
    const password = 'correct horse battery staple';
    const payload = {
      email,
      password,
      fullName: 'Example Vendor',
      storeName: 'Example Store',
      phone: '+2348012345678',
    };

    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(201);

    expect(registered.body.email).toBe(email.toLowerCase());
    expect(registered.body.status).toBe('PENDING_VERIFICATION');
    expect(registered.body.phone).toBe(payload.phone);
    expect(JSON.stringify(registered.body)).not.toContain(password);

    const vendorRows = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      status: string;
      email_verified_at: Date | null;
      phone: string | null;
    }>(
      `SELECT id, email, password_hash, status, email_verified_at, phone
       FROM vendors WHERE email = $1`,
      [email.toLowerCase()],
    );
    const vendor = vendorRows.rows[0];
    expect(vendor).toBeDefined();
    expect(vendor?.password_hash).not.toBe(password);
    expect(vendor?.password_hash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(vendor!.password_hash, password)).resolves.toBe(
      true,
    );
    expect(vendor?.status).toBe('PENDING_VERIFICATION');
    expect(vendor?.email_verified_at).toBeNull();

    const code = emailSender.codeFor(email.toLowerCase());
    expect(code).toBeDefined();
    expect(code).toMatch(/^\d{6}$/);
    const storedCodes = await pool.query<{ code_hash: string }>(
      'SELECT code_hash FROM email_verification_codes WHERE vendor_id = $1',
      [vendor?.id],
    );
    expect(storedCodes.rows[0]?.code_hash).not.toBe(code);
    expect(storedCodes.rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/verify')
      .send({ email: email.toLowerCase(), code })
      .expect(200);
    expect(verified.body).toEqual({ message: 'Email verified.' });

    const afterVerification = await pool.query<{
      email_verified_at: Date | null;
      status: string;
    }>('SELECT email_verified_at, status FROM vendors WHERE id = $1', [
      vendor?.id,
    ]);
    expect(afterVerification.rows[0]?.email_verified_at).not.toBeNull();
    expect(afterVerification.rows[0]?.status).toBe('PENDING_VERIFICATION');

    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/verify')
      .send({ email: email.toLowerCase(), code })
      .expect(400);
  });

  it('issues cookie-only sessions and revokes a session when a rotated refresh token is reused', async () => {
    const email = `session-${randomUUID()}@example.test`;
    const password = 'correct horse battery staple';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        fullName: 'Session Vendor',
        storeName: 'Session Store',
      })
      .expect(201);
    const code = emailSender.codeFor(email);
    expect(code).toBeDefined();
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/verify')
      .send({ email, code })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    expect(JSON.stringify(login.body)).not.toMatch(/token|jwt/i);
    const loginCookies = cookieArray(login.headers['set-cookie']);
    expect(loginCookies).toHaveLength(2);
    expect(loginCookies[0]).toContain('HttpOnly');
    expect(loginCookies[0]).toContain('SameSite=Lax');
    expect(loginCookies.join(';')).toContain('Path=/api/v1');
    const refreshCookie = cookieValue(
      login.headers['set-cookie'],
      'kova_refresh',
    );
    const oldCookieHeader = `kova_refresh=${refreshCookie}`;
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookieHeader)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookieHeader)
      .expect(401);
    const currentCookie = cookieValue(
      rotated.headers['set-cookie'],
      'kova_refresh',
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `kova_refresh=${currentCookie}`)
      .expect(401);
    const sessions = await pool.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM auth_sessions WHERE vendor_id = (SELECT id FROM vendors WHERE email = $1)',
      [email],
    );
    expect(sessions.rows[0]?.revoked_at).not.toBeNull();

    const secondLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    const passwordChangeCookie = cookieValue(
      secondLogin.headers['set-cookie'],
      'kova_refresh',
    );
    const nextPassword = 'correct horse battery staple updated';
    const passwordChanged = await request(app.getHttpServer())
      .post('/api/v1/auth/password/change')
      .set('Cookie', `kova_refresh=${passwordChangeCookie}`)
      .send({ oldPassword: password, newPassword: nextPassword })
      .expect(200);
    expect(passwordChanged.body.message).toMatch(/sign in again/i);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `kova_refresh=${passwordChangeCookie}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(401);

    const thirdLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: nextPassword })
      .expect(201);
    const logoutCookie = cookieValue(
      thirdLogin.headers['set-cookie'],
      'kova_refresh',
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `kova_refresh=${logoutCookie}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `kova_refresh=${logoutCookie}`)
      .expect(401);
  });

  it('does not require an idempotency key or persist registration responses', async () => {
    const email = `vendor-${randomUUID()}@example.test`;
    const payload = {
      email,
      password: 'correct horse battery staple',
      fullName: 'Another Vendor',
      storeName: 'Another Store',
    };
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(409);

    const storedResponses = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM idempotency_keys
       WHERE scope LIKE 'POST:%/api/v1/auth/%'`,
    );
    expect(storedResponses.rows[0]?.count).toBe('0');
  });

  it('enforces the resend cooldown and consumes the five code attempts', async () => {
    const email = `attempts-${randomUUID()}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'correct horse battery staple',
        fullName: 'Attempt Vendor',
        storeName: 'Attempt Store',
      })
      .expect(201);
    const code = emailSender.codeFor(email);
    expect(code).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/resend')
      .send({ email })
      .expect(429);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/email-verification/verify')
        .send({ email, code: code === '000000' ? '000001' : '000000' })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/verify')
      .send({ email, code })
      .expect(400);
  });

  it('rejects an expired email code', async () => {
    const email = `expired-${randomUUID()}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'correct horse battery staple',
        fullName: 'Expired Vendor',
        storeName: 'Expired Store',
      })
      .expect(201);
    const code = emailSender.codeFor(email);
    expect(code).toBeDefined();
    await pool.query(
      `UPDATE email_verification_codes SET expires_at = now() - interval '1 second'
       WHERE vendor_id = (SELECT id FROM vendors WHERE email = $1)`,
      [email],
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/verify')
      .send({ email, code })
      .expect(400);
  });
});

function cookieValue(
  cookies: string | string[] | undefined,
  name: string,
): string {
  const values = typeof cookies === 'string' ? [cookies] : (cookies ?? []);
  const cookie = values.find((value) => value.startsWith(`${name}=`));
  expect(cookie).toBeDefined();
  return cookie!.split(';', 1)[0]!.slice(name.length + 1);
}

function cookieArray(cookies: string | string[] | undefined): string[] {
  return typeof cookies === 'string' ? [cookies] : (cookies ?? []);
}
