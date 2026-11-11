import { char, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { vendors } from './vendors';

export const emailVerificationCodes = pgTable('email_verification_codes', {
  vendorId: uuid('vendor_id')
    .primaryKey()
    .references(() => vendors.id, { onDelete: 'cascade' }),
  codeHash: char('code_hash', { length: 64 }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
