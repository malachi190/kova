import {
  char,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { vendors } from './vendors';

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    refreshTokenHash: char('refresh_token_hash', { length: 64 }).notNull(),
    previousRefreshTokenHash: char('previous_refresh_token_hash', {
      length: 64,
    }),
    tokenVersion: integer('token_version').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_sessions_refresh_token_hash_idx').on(
      table.refreshTokenHash,
    ),
    index('auth_sessions_vendor_idx').on(table.vendorId),
    index('auth_sessions_previous_refresh_hash_idx').on(
      table.previousRefreshTokenHash,
    ),
  ],
);
