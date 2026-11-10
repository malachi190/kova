import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { createDatabase } from '../../db/database';
import { auditLog } from '../../db/schema/audit-log';
import { AuditDatabase } from './audit.database';
import { redactAuditData } from './audit.redaction';
import { validateAuditRecord, type AuditRecordInput } from './audit.validation';

export type AuditExecutor = Pick<
  ReturnType<typeof createDatabase>['db'],
  'insert'
>;

@Injectable()
export class AuditService {
  constructor(private readonly database: AuditDatabase) {}

  async record(input: AuditRecordInput, transaction?: AuditExecutor) {
    let record;
    try {
      record = validateAuditRecord(input);
    } catch {
      throw new BadRequestException('Invalid audit record');
    }

    let beforeState: unknown | null;
    let afterState: unknown | null;
    try {
      beforeState =
        record.before === undefined ? null : redactAuditData(record.before);
      afterState =
        record.after === undefined ? null : redactAuditData(record.after);
    } catch {
      throw new BadRequestException('Audit state must be JSON serializable');
    }

    const executor = transaction ?? this.database.db;
    const rows = await executor
      .insert(auditLog)
      .values({
        actorType: record.actorType,
        actorId: record.actorId ?? null,
        action: record.action,
        entityType: record.entity,
        entityId: record.entityId,
        beforeState,
        afterState,
        ipAddress: record.ip ?? null,
      })
      .returning();
    const inserted = rows[0];
    if (!inserted) throw new Error('Audit insert returned no row');
    return inserted;
  }

  async findByEntity(entity: string, entityId: string, limit = 50) {
    if (!entity.trim() || entity.length > 100 || !isUuid(entityId)) {
      throw new BadRequestException('Invalid audit query');
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Invalid audit query limit');
    }

    return this.database.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityType, entity), eq(auditLog.entityId, entityId)),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
