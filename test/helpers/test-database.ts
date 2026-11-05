import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const TEST_DATABASE_NAME = /^kova_test_[0-9a-f]{32}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface TestDatabase {
  readonly connectionString: string;
  readonly databaseName: string;
  drop(): Promise<void>;
}

export function validateTestDatabaseAdminUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_ADMIN_URL must be a valid PostgreSQL URL');
  }

  if (
    url.protocol !== 'postgresql:' ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.pathname !== '/postgres'
  ) {
    throw new Error(
      'TEST_DATABASE_ADMIN_URL must connect to the local PostgreSQL maintenance database named postgres',
    );
  }

  return url;
}

export async function createTestDatabase(
  adminUrl = process.env.TEST_DATABASE_ADMIN_URL,
): Promise<TestDatabase> {
  if (!adminUrl) {
    throw new Error(
      'TEST_DATABASE_ADMIN_URL is required to create a test database',
    );
  }

  const safeAdminUrl = validateTestDatabaseAdminUrl(adminUrl);
  const databaseName = `kova_test_${randomUUID().replaceAll('-', '')}`;
  const adminClient = new Client({ connectionString: safeAdminUrl.toString() });

  try {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await adminClient.end();
  }

  const testDatabaseUrl = new URL(safeAdminUrl);
  testDatabaseUrl.pathname = `/${databaseName}`;
  let dropped = false;

  return {
    connectionString: testDatabaseUrl.toString(),
    databaseName,
    async drop(): Promise<void> {
      if (dropped) return;
      if (!TEST_DATABASE_NAME.test(databaseName)) {
        throw new Error(
          'Refusing to drop a database without a generated Kova test name',
        );
      }
      const client = new Client({ connectionString: safeAdminUrl.toString() });
      try {
        await client.connect();
        await client.query(`DROP DATABASE "${databaseName}"`);
        dropped = true;
      } finally {
        await client.end();
      }
    },
  };
}
