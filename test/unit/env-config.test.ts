import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadApiConfig,
  loadRuntimeConfig,
} from '../../src/common/config/env-config';
import { bootstrapApi } from '../../src/main.api';
import { bootstrapScheduler } from '../../src/main.scheduler';
import { bootstrapWorker } from '../../src/main.worker';

const sharedConfig = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test_user:test_password@127.0.0.1:5432/kova_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  RABBITMQ_URL: 'amqp://test_user:test_password@127.0.0.1:5672/kova_test',
};

test('API config parses required API settings and a numeric port', () => {
  const config = loadApiConfig({
    ...sharedConfig,
    PORT: '4310',
    CORS_ORIGIN: 'https://dashboard.example.test',
  });

  assert.equal(config.PORT, 4310);
  assert.equal(config.CORS_ORIGIN, 'https://dashboard.example.test');
});

test('worker config does not require API-only values', () => {
  const config = loadRuntimeConfig(sharedConfig);
  assert.equal(config.NODE_ENV, 'test');
});

test('missing required settings fail with field names and no values', () => {
  assert.throws(
    () => loadApiConfig({ DATABASE_URL: 'sensitive-value' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /NODE_ENV/);
      assert.match(error.message, /REDIS_URL/);
      assert.match(error.message, /RABBITMQ_URL/);
      assert.match(error.message, /PORT/);
      assert.match(error.message, /CORS_ORIGIN/);
      assert.doesNotMatch(error.message, /sensitive-value/);
      return true;
    },
  );
});

test('invalid schemes, ports, and CORS protocols are rejected', () => {
  assert.throws(() =>
    loadApiConfig({
      ...sharedConfig,
      DATABASE_URL: 'https://db.example.test',
      PORT: '65536',
      CORS_ORIGIN: 'ftp://dashboard.example.test',
    }),
  );
});

test('all process bootstraps refuse to start with missing runtime configuration', async () => {
  const keys = [
    'NODE_ENV',
    'DATABASE_URL',
    'REDIS_URL',
    'RABBITMQ_URL',
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  try {
    await assert.rejects(bootstrapApi(), /Invalid environment configuration/);
    await assert.rejects(
      bootstrapWorker(),
      /Invalid environment configuration/,
    );
    await assert.rejects(
      bootstrapScheduler(),
      /Invalid environment configuration/,
    );
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
