import assert from 'node:assert/strict';
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
