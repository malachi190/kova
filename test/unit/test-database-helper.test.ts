import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTestDatabaseAdminUrl } from '../helpers/test-database';

test('accepts only a local PostgreSQL maintenance database URL', () => {
  const url = validateTestDatabaseAdminUrl(
    'postgresql://test_admin:test_password@localhost:5432/postgres',
  );
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.pathname, '/postgres');
});

test('rejects non-local hosts and non-maintenance database names without echoing values', () => {
  for (const unsafeUrl of [
    'postgresql://user:private-value@db.example.test:5432/postgres',
    'postgresql://user:private-value@localhost:5432/kova_dev',
    'not-a-url-private-value',
  ]) {
    assert.throws(
      () => validateTestDatabaseAdminUrl(unsafeUrl),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, /private-value/);
        return true;
      },
    );
  }
});
