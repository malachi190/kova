import assert from 'node:assert/strict';
import test from 'node:test';
import { RedisThrottlerStorage } from '../../src/common/rate-limit/redis-throttler.storage';

test('Redis throttler uses one atomic Lua call and maps the rate-limit record', async () => {
  let capturedKeys: string[] = [];
  let capturedArguments: string[] = [];
  let capturedScript = '';
  const storage = new RedisThrottlerStorage({
    isOpen: true,
    async eval(
      script: string,
      options: { keys: string[]; arguments: string[] },
    ) {
      capturedScript = script;
      capturedKeys = options.keys;
      capturedArguments = options.arguments;
      return [61, 30_000, 1, 20_000];
    },
    async connect() {
      throw new Error('Connection is unnecessary for this test');
    },
    destroy() {},
  } as never);

  const record = await storage.increment(
    'hashed-tracker',
    60_000,
    60,
    20_000,
    'default',
  );

  assert.equal(record.totalHits, 61);
  assert.equal(record.timeToExpire, 30_000);
  assert.equal(record.isBlocked, true);
  assert.equal(record.timeToBlockExpire, 20_000);
  assert.match(capturedScript, /redis\.call\('INCR'/);
  assert.deepEqual(capturedKeys, [
    'kova:throttle:{default:hashed-tracker}',
    'kova:throttle:{default:hashed-tracker}:blocked',
  ]);
  assert.deepEqual(capturedArguments, ['60000', '60', '20000']);
});

test('Redis throttler rejects malformed Lua replies', async () => {
  const storage = new RedisThrottlerStorage({
    isOpen: true,
    async eval() {
      return [1, 'invalid', 0, 0];
    },
    async connect() {
      throw new Error('Connection is unnecessary for this test');
    },
    destroy() {},
  } as never);

  await assert.rejects(
    storage.increment('hashed-tracker', 60_000, 60, 60_000, 'default'),
    /invalid throttling counters/,
  );
});
