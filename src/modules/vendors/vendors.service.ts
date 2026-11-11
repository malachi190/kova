import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../../db/database';
import { vendors } from '../../db/schema/vendors';
import { VendorsDatabase } from './vendors.database';

export interface RegisterVendorInput {
  email: string;
  passwordHash: string;
  fullName: string;
  storeName: string;
  phone?: string;
}

type VendorTransaction = Pick<
  ReturnType<typeof createDatabase>['db'],
  'update'
>;

type VendorDatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof createDatabase>['db']['transaction']>[0]
>[0];

@Injectable()
export class VendorsService {
  constructor(private readonly database: VendorsDatabase) {}

  async register(input: RegisterVendorInput) {
    try {
      const rows = await this.database.db
        .insert(vendors)
        .values({
          email: normalizeEmail(input.email),
          passwordHash: input.passwordHash,
          fullName: input.fullName.trim(),
          storeName: input.storeName.trim(),
          phone: input.phone?.trim() || null,
        })
        .returning({
          id: vendors.id,
          email: vendors.email,
          fullName: vendors.fullName,
          storeName: vendors.storeName,
          phone: vendors.phone,
          status: vendors.status,
          emailVerifiedAt: vendors.emailVerifiedAt,
          createdAt: vendors.createdAt,
        });
      const vendor = rows[0];
      if (!vendor) throw new Error('Vendor insert returned no row');
      return vendor;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async findForAuthentication(email: string) {
    const rows = await this.database.db
      .select({
        id: vendors.id,
        email: vendors.email,
        passwordHash: vendors.passwordHash,
        fullName: vendors.fullName,
        storeName: vendors.storeName,
        phone: vendors.phone,
        status: vendors.status,
        emailVerifiedAt: vendors.emailVerifiedAt,
      })
      .from(vendors)
      .where(eq(vendors.email, normalizeEmail(email)))
      .limit(1);
    return rows[0];
  }

  async findForAuthenticationById(vendorId: string) {
    const rows = await this.database.db
      .select({
        id: vendors.id,
        email: vendors.email,
        passwordHash: vendors.passwordHash,
        fullName: vendors.fullName,
        storeName: vendors.storeName,
        phone: vendors.phone,
        status: vendors.status,
        emailVerifiedAt: vendors.emailVerifiedAt,
      })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);
    return rows[0];
  }

  async findForEmailVerification(email: string) {
    const rows = await this.database.db
      .select({
        id: vendors.id,
        email: vendors.email,
        status: vendors.status,
        emailVerifiedAt: vendors.emailVerifiedAt,
      })
      .from(vendors)
      .where(eq(vendors.email, normalizeEmail(email)))
      .limit(1);
    return rows[0];
  }

  async markEmailVerified(vendorId: string, transaction?: VendorTransaction) {
    const executor = transaction ?? this.database.db;
    const rows = await executor
      .update(vendors)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(vendors.id, vendorId))
      .returning({ id: vendors.id });
    if (!rows[0]) throw new NotFoundException('Vendor account not found');
  }

  async changePassword(
    vendorId: string,
    currentPasswordHash: string,
    nextPasswordHash: string,
    revokeSessions: (transaction: VendorDatabaseTransaction) => Promise<void>,
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      const rows = await transaction
        .update(vendors)
        .set({ passwordHash: nextPasswordHash, updatedAt: new Date() })
        .where(
          and(
            eq(vendors.id, vendorId),
            eq(vendors.passwordHash, currentPasswordHash),
          ),
        )
        .returning({ id: vendors.id });
      if (!rows[0])
        throw new ConflictException('Password changed; sign in again');
      await revokeSessions(transaction);
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '23505') return true;
  return (
    'cause' in error &&
    typeof error.cause === 'object' &&
    error.cause !== null &&
    'code' in error.cause &&
    error.cause.code === '23505'
  );
}
