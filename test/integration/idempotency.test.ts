import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { Pool } from 'pg';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { createTestDatabase } from '../helpers/test-database';

const execFileAsync = promisify(execFile);
const testAdminUrl = process.env.TEST_DATABASE_ADMIN_URL;

test(
  'idempotency serializes requests, replays responses, rejects mismatches, and expires after 48 hours',
  {
    skip:
      !testAdminUrl && 'Set TEST_DATABASE_ADMIN_URL to a local /postgres URL',
  },
  async () => {
    const testDatabase = await createTestDatabase(testAdminUrl);
    const firstPool = new Pool({
      connectionString: testDatabase.connectionString,
    });
    const secondPool = new Pool({
      connectionString: testDatabase.connectionString,
    });
    const firstService = new IdempotencyService(firstPool);
    const secondService = new IdempotencyService(secondPool);

    try {
      await runMigrationCommand(testDatabase.connectionString);

      let callCount = 0;
      let releaseFirstAction: (() => void) | undefined;
      let markFirstActionStarted: (() => void) | undefined;
      const firstActionStarted = new Promise<void>((resolve) => {
        markFirstActionStarted = resolve;
      });
      const firstActionGate = new Promise<void>((resolve) => {
        releaseFirstAction = resolve;
      });
      const firstRequest = firstService.execute(
        'POST:/test',
        'concurrent-key',
        '0'.repeat(64),
        async () => {
          callCount += 1;
          markFirstActionStarted?.();
          await firstActionGate;
          return { status: 201, body: { result: 'created' } };
        },
      );

      await firstActionStarted;
      const secondRequest = secondService.execute(
        'POST:/test',
        'concurrent-key',
        '0'.repeat(64),
        async () => {
          callCount += 1;
          return { status: 201, body: { result: 'duplicate' } };
        },
      );
      releaseFirstAction?.();

      const [firstResult, secondResult] = await Promise.all([
        firstRequest,
        secondRequest,
      ]);
      assert.equal(callCount, 1);
      assert.equal(firstResult.replayed, false);
      assert.equal(secondResult.replayed, true);
      assert.equal(secondResult.status, 201);
      assert.deepEqual(secondResult.body, { result: 'created' });

      const replay = await firstService.execute(
        'POST:/test',
        'concurrent-key',
        '0'.repeat(64),
        async () => {
          callCount += 1;
          return { status: 200, body: { result: 'unexpected' } };
        },
      );
      assert.equal(replay.replayed, true);
      assert.equal(callCount, 1);

      await assert.rejects(
        firstService.execute(
          'POST:/test',
          'concurrent-key',
          '1'.repeat(64),
          async () => ({ status: 200, body: null }),
        ),
        /different request/,
      );

      await firstPool.query(
        `UPDATE idempotency_keys
         SET expires_at = now() - interval '1 second'
         WHERE scope = $1 AND key = $2`,
        ['POST:/test', 'concurrent-key'],
      );
      const afterExpiry = await secondService.execute(
        'POST:/test',
        'concurrent-key',
        '1'.repeat(64),
        async () => ({ status: 200, body: { result: 'new request' } }),
      );
      assert.equal(afterExpiry.replayed, false);
      assert.deepEqual(afterExpiry.body, { result: 'new request' });

      await firstPool.query(
        `INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '48 hours')`,
        ['POST:/test', 'unresolved-key', '2'.repeat(64)],
      );
      await assert.rejects(
        secondService.execute(
          'POST:/test',
          'unresolved-key',
          '2'.repeat(64),
          async () => ({ status: 200, body: { result: 'must not run' } }),
        ),
        /outcome is unresolved/,
      );
    } finally {
      await Promise.all([
        firstService.onModuleDestroy(),
        secondService.onModuleDestroy(),
      ]);
      await testDatabase.drop();
    }
  },
);

async function runMigrationCommand(databaseUrl: string): Promise<void> {
  try {
    await execFileAsync('pnpm', ['db:migrate'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 30_000,
    });
  } catch {
    throw new Error(
      'pnpm db:migrate failed against the isolated idempotency test database',
    );
  }
}
