import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadApiConfig,
  parseBodyLimitOverrides,
  parseTrustProxySetting,
} from '../../src/common/config/env-config';
import { resolveRequestBodyLimit } from '../../src/common/security/request-body-parser';
import { createTestApiConfig } from '../helpers/api-config';

test('guardrail defaults and profiles are validated and exposed', () => {
  const config = createTestApiConfig();
  assert.equal(config.trustProxy, false);
  assert.equal(config.BODY_LIMIT_BYTES, 100 * 1024);
  assert.deepEqual(config.throttleProfiles, {
    default: { limit: 60, ttl: 60_000 },
    auth: { limit: 5, ttl: 60_000 },
    otp: { limit: 3, ttl: 300_000 },
    payment: { limit: 10, ttl: 60_000 },
    dispute: { limit: 3, ttl: 60_000 },
  });
});

test('auth secret must be 32 bytes in hex and Resend settings must be paired', () => {
  const base = {
    NODE_ENV: 'test',
    AUTH_SECRET: '11'.repeat(32),
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/kova',
    REDIS_URL: 'redis://127.0.0.1:6379',
    RABBITMQ_URL: 'amqp://test:test@127.0.0.1:5672/kova',
    PORT: '3000',
    CORS_ORIGIN: 'http://localhost:3001',
  };
  assert.equal(loadApiConfig(base).auth.secret.byteLength, 32);
  assert.throws(
    () => loadApiConfig({ ...base, AUTH_SECRET: 'not-a-secret' }),
    /AUTH_SECRET/,
  );
  assert.throws(
    () => loadApiConfig({ ...base, RESEND_API_KEY: 're_test' }),
    /RESEND_API_KEY and RESEND_FROM_EMAIL/,
  );
  assert.throws(
    () =>
      loadApiConfig({
        ...base,
        RESEND_API_KEY: 're_test',
        RESEND_FROM_EMAIL: 'not-an-email',
      }),
    /RESEND_FROM_EMAIL/,
  );
});

test('CORS accepts exact origin allowlists and rejects wildcard or malformed entries', () => {
  const config = loadApiConfig({
    NODE_ENV: 'test',
    AUTH_SECRET: '11'.repeat(32),
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/kova',
    REDIS_URL: 'redis://127.0.0.1:6379',
    RABBITMQ_URL: 'amqp://test:test@127.0.0.1:5672/kova',
    PORT: '3000',
    CORS_ORIGIN: 'http://localhost:3001, https://dashboard.example.test',
  });
  assert.deepEqual(config.corsOrigins, [
    'http://localhost:3001',
    'https://dashboard.example.test',
  ]);

  for (const CORS_ORIGIN of [
    '*',
    'https://example.test/path',
    'https://example.test, *',
    'https://example.test,not-an-origin',
  ]) {
    assert.throws(
      () =>
        loadApiConfig({
          NODE_ENV: 'test',
          AUTH_SECRET: '11'.repeat(32),
          DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/kova',
          REDIS_URL: 'redis://127.0.0.1:6379',
          RABBITMQ_URL: 'amqp://test:test@127.0.0.1:5672/kova',
          PORT: '3000',
          CORS_ORIGIN,
        }),
      /CORS_ORIGIN/,
    );
  }
});

test('trust proxy accepts hop counts and trusted networks, but rejects unsafe values', () => {
  assert.equal(parseTrustProxySetting(), false);
  assert.equal(parseTrustProxySetting('1'), 1);
  assert.deepEqual(parseTrustProxySetting('loopback, 192.168.1.0/24'), [
    'loopback',
    '192.168.1.0/24',
  ]);
  for (const value of ['true', '2,3', '192.168.1.1/33', 'not-a-proxy']) {
    assert.throws(() => parseTrustProxySetting(value));
  }
  assert.throws(
    () =>
      loadApiConfig({
        NODE_ENV: 'test',
        AUTH_SECRET: '11'.repeat(32),
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/kova',
        REDIS_URL: 'redis://127.0.0.1:6379',
        RABBITMQ_URL: 'amqp://test:test@127.0.0.1:5672/kova',
        PORT: '3000',
        CORS_ORIGIN: 'http://localhost:3001',
        TRUST_PROXY: 'true',
      }),
    /TRUST_PROXY/,
  );
});

test('body prefix overrides are validated and choose the most specific match', () => {
  const overrides = parseBodyLimitOverrides(
    '/v1/evidence=204800,/v1/evidence/images=512000',
  );
  assert.equal(
    resolveRequestBodyLimit('/v1/evidence/images/a', 102400, overrides),
    512000,
  );
  assert.equal(
    resolveRequestBodyLimit('/v1/evidence-other', 102400, overrides),
    102400,
  );
  assert.throws(() => parseBodyLimitOverrides('/bad=0'));
  assert.throws(() => parseBodyLimitOverrides('/same=1,/same=2'));
});
