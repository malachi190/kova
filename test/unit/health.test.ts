import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiApplication } from '../../src/main.api';
import { createTestApiConfig } from '../helpers/api-config';

test('GET /health reports dependency states and uses 503 when a dependency is down', async () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    rabbitMqUrl: process.env.RABBITMQ_URL,
  };
  const apiConfig = createTestApiConfig();
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  delete process.env.RABBITMQ_URL;

  const app = await createApiApplication(apiConfig);
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: 'error',
      dependencies: {
        postgres: 'down',
        redis: 'down',
        rabbitmq: 'down',
      },
    });
  } finally {
    await app.close();
    restoreEnvironment('DATABASE_URL', previous.databaseUrl);
    restoreEnvironment('REDIS_URL', previous.redisUrl);
    restoreEnvironment('RABBITMQ_URL', previous.rabbitMqUrl);
  }
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
