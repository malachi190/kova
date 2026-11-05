import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import test from 'node:test';
import { createApiApplication } from '../../src/main.api';
import { createSchedulerApplication } from '../../src/main.scheduler';
import { createWorkerApplication } from '../../src/main.worker';
import { createTestApiConfig } from '../helpers/api-config';

test('API entry point creates and closes an application', async () => {
  const app = await createApiApplication(createTestApiConfig());
  await app.init();
  await app.close();
  assert.ok(app);
});

test('worker entry point creates and closes an application context', async () => {
  const app = await createWorkerApplication();
  await app.close();
  assert.ok(app);
});

test('scheduler entry point creates and closes an application context', async () => {
  const app = await createSchedulerApplication();
  await app.close();
  assert.ok(app);
});

test('API entry point terminates after SIGTERM', async () => {
  const port = await findAvailablePort();
  const child = spawn(process.execPath, ['dist/src/main.api.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/kova_test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      RABBITMQ_URL: 'amqp://test:test@127.0.0.1:5672/kova_test',
      PORT: String(port),
      CORS_ORIGIN: 'http://localhost:3001',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const started = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('API did not start in time')),
      5_000,
    );
    const onOutput = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('Nest application successfully started')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.once('error', reject);
  });

  try {
    await started;
    child.kill('SIGTERM');
    const result = await exited;
    assert.equal(result.signal, 'SIGTERM');
    assert.equal(result.code, null);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  }
});

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}
