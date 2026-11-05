import {
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    beforeState: jsonb('before_state').$type<unknown>(),
    afterState: jsonb('after_state').$type<unknown>(),
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_created_at_idx').on(table.createdAt),
  ],
);
