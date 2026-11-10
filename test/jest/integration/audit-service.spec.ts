import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import * as schema from '../../../src/db/schema';
import { createDatabase } from '../../../src/db/database';
import { AuditDatabase } from '../../../src/modules/audit/audit.database';
import { AuditService } from '../../../src/modules/audit/audit.service';

describe('AuditService with PostgreSQL', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  let connection: ReturnType<typeof createDatabase>;
  let service: AuditService;

  beforeAll(async () => {
    const password = randomBytes(24).toString('hex');
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('kova_audit_test')
      .withUsername('kova_test')
      .withPassword(password)
      .start();
    const migrationPool = new Pool({
      connectionString: container.getConnectionUri(),
    });
    try {
      await migrate(drizzle({ client: migrationPool, schema }), {
        migrationsFolder: path.resolve(process.cwd(), 'src/db/migrations'),
      });
    } finally {
      await migrationPool.end();
    }
    connection = createDatabase(container.getConnectionUri());
    service = new AuditService({ db: connection.db } as AuditDatabase);
  }, 60_000);

  afterAll(async () => {
    await connection?.pool.end();
    await container?.stop();
  });

  it('writes in the caller transaction and rolls back with it', async () => {
    const entityId = crypto.randomUUID();
    await expect(
      connection.db.transaction(async (transaction) => {
        await service.record(
          {
            actorType: 'system',
            action: 'deal.created',
            entity: 'deal',
            entityId,
          },
          transaction,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await expect(service.findByEntity('deal', entityId)).resolves.toHaveLength(
      0,
    );
  });

  it('writes standalone records and round-trips redacted JSON', async () => {
    const entityId = crypto.randomUUID();
    const inserted = await service.record({
      actorType: 'vendor',
      actorId: crypto.randomUUID(),
      action: 'deal.updated',
      entity: 'deal',
      entityId,
      before: { status: 'CREATED', password: 'never-store' },
      after: { status: 'PAID', nested: { bvn: 'never-store' } },
      ip: '192.0.2.8',
    });

    expect(inserted.beforeState).toEqual({
      status: 'CREATED',
      password: '[REDACTED]',
    });
    expect(inserted.afterState).toEqual({
      status: 'PAID',
      nested: { bvn: '[REDACTED]' },
    });
    expect(inserted.ipAddress).toBe('192.0.2.8');
    await expect(service.findByEntity('deal', entityId)).resolves.toHaveLength(
      1,
    );
  });

  it('accepts concurrent inserts without losing records', async () => {
    const entityId = crypto.randomUUID();
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        service.record({
          actorType: 'system',
          action: `audit.concurrent.${index}`,
          entity: 'deal',
          entityId,
        }),
      ),
    );
    await expect(
      service.findByEntity('deal', entityId, 20),
    ).resolves.toHaveLength(12);
  });
});
