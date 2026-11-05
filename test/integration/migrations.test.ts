import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { Pool } from 'pg';
import { createTestDatabase } from '../helpers/test-database';

const execFileAsync = promisify(execFile);
const testAdminUrl = process.env.TEST_DATABASE_ADMIN_URL;

test(
  'foundation migrations apply to an empty database and keep audit rows immutable',
  {
    skip:
      !testAdminUrl && 'Set TEST_DATABASE_ADMIN_URL to a local /postgres URL',
  },
  async () => {
    const testDatabase = await createTestDatabase(testAdminUrl);
    const pool = new Pool({ connectionString: testDatabase.connectionString });

    try {
      await runMigrationCommand(testDatabase.connectionString);
      await runMigrationCommand(testDatabase.connectionString);

      const tables = await pool.query<{
        idempotency: string | null;
        audit: string | null;
      }>(
        `SELECT to_regclass('public.idempotency_keys') AS idempotency,
                to_regclass('public.audit_log') AS audit`,
      );
      assert.equal(tables.rows[0]?.idempotency, 'idempotency_keys');
      assert.equal(tables.rows[0]?.audit, 'audit_log');

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO audit_log (actor_type, action, entity_type, entity_id)
         VALUES ('system', 'migration_test', 'test_entity', gen_random_uuid())
         RETURNING id`,
      );
      const auditId = inserted.rows[0]?.id;
      assert.ok(auditId);

      await assert.rejects(
        pool.query('UPDATE audit_log SET action = $1 WHERE id = $2', [
          'changed',
          auditId,
        ]),
        /audit_log is append-only/,
      );
      await assert.rejects(
        pool.query('DELETE FROM audit_log WHERE id = $1', [auditId]),
        /audit_log is append-only/,
      );
    } finally {
      await pool.end();
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
      'pnpm db:migrate failed against the isolated test database',
    );
  }
}
