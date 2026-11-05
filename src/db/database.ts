import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    max: 10,
  });

  return {
    db: drizzle({ client: pool, schema }),
    pool,
  };
}
