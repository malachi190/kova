import {
  char,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    scope: varchar('scope', { length: 255 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.key] }),
    index('idempotency_keys_expires_at_idx').on(table.expiresAt),
  ],
);
