import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const vendorStatus = pgEnum('vendor_status', [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'FROZEN',
]);

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    storeName: text('store_name').notNull(),
    phone: text('phone'),
    status: vendorStatus('status').notNull().default('PENDING_VERIFICATION'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('vendors_email_unique_idx').on(table.email)],
);
