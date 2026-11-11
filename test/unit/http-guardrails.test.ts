import assert from 'node:assert/strict';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Post,
  Req,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsString } from 'class-validator';
import {
  SkipThrottle,
  ThrottlerModule,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import test from 'node:test';
import { loadApiConfig } from '../../src/common/config/env-config';
import { RedisThrottlerGuard } from '../../src/common/rate-limit/redis-throttler.guard';
import { ThrottleProfile } from '../../src/common/rate-limit/throttle-profile.decorator';
import { RedisThrottlerUnavailableError } from '../../src/common/rate-limit/redis-throttler.storage';
import { configureApiHttp } from '../../src/common/security/api-http-setup';
import {
  getRequestMetadata,
  USER_AGENT_MAX_LENGTH,
} from '../../src/common/security/request-metadata';

class MemoryThrottlerStorage implements ThrottlerStorage {
  private readonly entries = new Map<
    string,
    { count: number; expiresAt: number; blockedUntil: number }
  >();
  unavailable = false;

  clear(): void {
    this.entries.clear();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    if (this.unavailable) throw new RedisThrottlerUnavailableError();
    const id = `${throttlerName}:${key}`;
    const now = Date.now();
    let record = this.entries.get(id);
    if (!record || record.expiresAt <= now) {
      record = { count: 0, expiresAt: now + ttl, blockedUntil: 0 };
      this.entries.set(id, record);
    }
    record.count += 1;
    if (record.count > limit && record.blockedUntil <= now) {
      record.blockedUntil = now + blockDuration;
    }
    return {
      totalHits: record.count,
      timeToExpire: Math.max(0, record.expiresAt - now),
      isBlocked: record.blockedUntil > now,
      timeToBlockExpire: Math.max(0, record.blockedUntil - now),
    };
  }
}

const memoryStorage = new MemoryThrottlerStorage();

class ProbeDto {
  @IsString()
  name!: string;
}

@Controller()
class GuardrailProbeController {
  @Get('default')
  defaultRoute() {
    return { ok: true };
  }

  @Get('auth')
  @ThrottleProfile('auth')
  authRoute() {
    return { ok: true };
  }

  @Get('otp')
  @ThrottleProfile('otp')
  otpRoute() {
    return { ok: true };
  }

  @Get('payment')
  @ThrottleProfile('payment')
  paymentRoute() {
    return { ok: true };
  }

  @Get('dispute')
  @ThrottleProfile('dispute')
  disputeRoute() {
    return { ok: true };
  }

  @Get('health')
  @SkipThrottle()
  healthRoute() {
    return { ok: true };
  }

  @Get('client-ip')
  @SkipThrottle()
  clientIp(@Req() request: Request) {
    return { ip: request.ip };
  }

  @Post('test-body/large')
  largeBody(@Body() body: { data: string }) {
    return { length: body.data.length };
  }

  @Post('test-body/upload/file')
  uploadBody(@Body() body: { data: string }) {
    return { length: body.data.length };
  }

  @Post('validate')
  validate(@Body() body: ProbeDto) {
    return body;
  }

  @Get('error')
  errorRoute() {
    throw new BadRequestException('sensitive token value');
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', limit: 2, ttl: 60_000 },
        { name: 'auth', limit: 1, ttl: 60_000 },
        { name: 'otp', limit: 1, ttl: 60_000 },
        { name: 'payment', limit: 1, ttl: 60_000 },
        { name: 'dispute', limit: 1, ttl: 60_000 },
      ],
      storage: memoryStorage,
    }),
  ],
  controllers: [GuardrailProbeController],
  providers: [{ provide: APP_GUARD, useClass: RedisThrottlerGuard }],
})
class GuardrailProbeModule {}

test('HTTP guardrails enforce profiles, retry headers, fail policy, body limits, proxy trust, CORS, and Helmet', async () => {
  const previousFailure = memoryStorage.unavailable;
  memoryStorage.unavailable = false;
  const app = await createProbeApp('1');

  try {
    const baseUrl = await listen(app);
    memoryStorage.clear();
    for (const route of ['auth', 'otp', 'payment', 'dispute']) {
      assert.equal((await fetch(apiUrl(baseUrl, route))).status, 200);
      const blocked = await fetch(apiUrl(baseUrl, route));
      assert.equal(blocked.status, 429);
      assert.deepEqual(await blocked.json(), {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: null,
        correlationId: blocked.headers.get('x-correlation-id'),
      });
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    }

    memoryStorage.clear();
    const allowedIp = '198.51.100.20';
    const requestFrom = (ip: string) =>
      fetch(apiUrl(baseUrl, 'default'), { headers: { 'x-forwarded-for': ip } });
    assert.equal((await requestFrom(allowedIp)).status, 200);
    assert.equal((await requestFrom(allowedIp)).status, 200);
    assert.equal((await requestFrom(allowedIp)).status, 429);
    assert.equal((await requestFrom('198.51.100.21')).status, 200);

    const metadataResponse = await fetch(apiUrl(baseUrl, 'client-ip'), {
      headers: { 'x-forwarded-for': '198.51.100.1, 198.51.100.2' },
    });
    assert.deepEqual(await metadataResponse.json(), { ip: '198.51.100.2' });

    memoryStorage.unavailable = true;
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    assert.equal((await fetch(apiUrl(baseUrl, 'auth'))).status, 200);
    const closed = await fetch(apiUrl(baseUrl, 'otp'));
    assert.equal(closed.status, 500);
    assert.equal(((await closed.json()) as { code: string }).code, 'HTTP_500');
    memoryStorage.unavailable = false;

    const oversized = await fetch(apiUrl(baseUrl, 'test-body/large'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(120 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(
      ((await oversized.json()) as { code: string }).code,
      'HTTP_413',
    );

    const smallBody = await fetch(apiUrl(baseUrl, 'test-body/large'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'small' }),
    });
    assert.equal(smallBody.status, 201);

    const largerAllowed = await fetch(
      apiUrl(baseUrl, 'test-body/upload/file'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: 'x'.repeat(120 * 1024) }),
      },
    );
    assert.equal(largerAllowed.status, 201);

    const invalidDto = await fetch(apiUrl(baseUrl, 'validate'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 42, token: 'must-not-echo' }),
    });
    assert.equal(invalidDto.status, 400);
    assert.equal(
      ((await invalidDto.json()) as { code: string }).code,
      'VALIDATION_ERROR',
    );

    const allowedOrigin = await fetch(apiUrl(baseUrl, 'error'), {
      headers: { origin: 'http://localhost:3001' },
    });
    const allowedError = (await allowedOrigin.json()) as {
      code: string;
      message: string;
    };
    assert.equal(allowedError.code, 'HTTP_400');
    assert.equal(allowedError.message, 'Bad request');
    assert.equal(
      JSON.stringify(allowedError).includes('sensitive token'),
      false,
    );
    assert.equal(
      allowedOrigin.headers.get('access-control-allow-origin'),
      'http://localhost:3001',
    );
    assert.equal(
      allowedOrigin.headers.get('x-content-type-options'),
      'nosniff',
    );
    assert.equal(allowedOrigin.headers.get('strict-transport-security'), null);

    const deniedOrigin = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'https://attacker.example' },
    });
    assert.equal(deniedOrigin.headers.get('access-control-allow-origin'), null);

    const preflight = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get('access-control-allow-origin'),
      'http://localhost:3001',
    );
  } finally {
    memoryStorage.unavailable = previousFailure;
    await app.close();
  }
});

test('trust proxy off ignores forwarded client IP and request metadata truncates user agent', async () => {
  const app = await createProbeApp(undefined);
  try {
    const baseUrl = await listen(app);
    const response = await fetch(apiUrl(baseUrl, 'client-ip'), {
      headers: { 'x-forwarded-for': '203.0.113.99' },
    });
    const data = (await response.json()) as { ip: string };
    assert.notEqual(data.ip, '203.0.113.99');

    const metadata = getRequestMetadata({
      ip: '203.0.113.8',
      headers: { 'user-agent': 'x'.repeat(USER_AGENT_MAX_LENGTH + 20) },
    });
    assert.equal(metadata.ipAddress, '203.0.113.8');
    assert.equal(metadata.userAgent?.length, USER_AGENT_MAX_LENGTH);
  } finally {
    await app.close();
  }
});

test('Helmet enables HSTS only in production', async () => {
  const app = await createProbeApp(undefined, 'production');
  try {
    const response = await fetch(`${await listen(app)}/health`);
    assert.match(
      response.headers.get('strict-transport-security') ?? '',
      /max-age=/,
    );
  } finally {
    await app.close();
  }
});

async function createProbeApp(
  trustProxy: string | undefined,
  nodeEnv: 'test' | 'production' = 'test',
) {
  const app = await NestFactory.create<NestExpressApplication>(
    GuardrailProbeModule,
    { bodyParser: false, logger: false },
  );
  configureApiHttp(
    app,
    loadApiConfig({
      NODE_ENV: nodeEnv,
      AUTH_SECRET: '11'.repeat(32),
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/kova',
      REDIS_URL: 'redis://127.0.0.1:6379',
      RABBITMQ_URL: 'amqp://test:test@127.0.0.1:5672/kova',
      PORT: '3000',
      CORS_ORIGIN: 'http://localhost:3001',
      BODY_LIMIT_OVERRIDES: '/api/v1/test-body/upload=204800',
      ...(trustProxy === undefined ? {} : { TRUST_PROXY: trustProxy }),
    }),
  );
  await app.init();
  return app;
}

async function listen(app: NestExpressApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/api/v1/${path}`;
}
