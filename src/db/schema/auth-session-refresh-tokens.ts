import {
  char,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authSessions } from './auth-sessions';

export const authSessionRefreshTokens = pgTable(
  'auth_session_refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    replacedByVersion: integer('replaced_by_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_session_refresh_tokens_hash_idx').on(table.tokenHash),
    index('auth_session_refresh_tokens_session_idx').on(table.sessionId),
  ],
);
