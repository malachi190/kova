import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { createApiApplication } from '../../src/main.api';
import { createSchedulerApplication } from '../../src/main.scheduler';
import { createWorkerApplication } from '../../src/main.worker';

test('API entry point creates and closes an application', async () => {
  const app = await createApiApplication();
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
  const child = spawn(process.execPath, ['dist/src/main.api.js'], {
    env: { ...process.env, PORT: '0' },
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
