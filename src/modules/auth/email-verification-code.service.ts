import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { AuthConfig } from '../../common/config/env-config';
import { emailVerificationCodes } from '../../db/schema/email-verification-codes';
import { AuthDatabase } from './auth.database';
import {
  constantTimeHashEquals,
  deriveAuthKey,
  keyedHash,
} from './auth-crypto';
import { EMAIL_SENDER, type EmailSender } from './email-sender';
import { AUTH_CONFIG } from './auth.tokens';
import { VendorsService, normalizeEmail } from '../vendors/vendors.service';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class EmailVerificationCodeService {
  private readonly codeHashKey: Buffer;

  constructor(
    private readonly database: AuthDatabase,
    private readonly vendors: VendorsService,
    @Inject(AUTH_CONFIG) config: AuthConfig,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {
    this.codeHashKey = deriveAuthKey(config, 'email-verification-code');
  }

  assertReady(): void {
    this.emailSender.assertReady();
  }

  async sendForVendor(vendor: { id: string; email: string }): Promise<void> {
    this.emailSender.assertReady();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    const codeHash = this.hashCode(vendor.id, code);

    await this.database.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${vendor.id}))`,
      );
      const current = await transaction
        .select({ sentAt: emailVerificationCodes.sentAt })
        .from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.vendorId, vendor.id))
        .limit(1)
        .for('update');
      const sentAt = current[0]?.sentAt;
      if (sentAt && now.getTime() - sentAt.getTime() < RESEND_COOLDOWN_MS) {
        throw new HttpException(
          'Wait before requesting another code',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await transaction
        .insert(emailVerificationCodes)
        .values({
          vendorId: vendor.id,
          codeHash,
          attempts: 0,
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
          sentAt: now,
          consumedAt: null,
        })
        .onConflictDoUpdate({
          target: emailVerificationCodes.vendorId,
          set: {
            codeHash,
            attempts: 0,
            expiresAt: new Date(now.getTime() + CODE_TTL_MS),
            sentAt: now,
            consumedAt: null,
          },
        });
    });

    try {
      await this.emailSender.sendVerificationCode(vendor.email, code);
    } catch (error) {
      await this.database.db
        .update(emailVerificationCodes)
        .set({ consumedAt: new Date() })
        .where(eq(emailVerificationCodes.vendorId, vendor.id));
      throw error;
    }
  }

  async request(email: string): Promise<void> {
    this.emailSender.assertReady();
    const vendor = await this.vendors.findForEmailVerification(
      normalizeEmail(email),
    );
    if (!vendor || vendor.emailVerifiedAt) return;
    await this.sendForVendor(vendor);
  }

  async verify(email: string, code: string): Promise<void> {
    const vendor = await this.vendors.findForEmailVerification(
      normalizeEmail(email),
    );
    if (!vendor || vendor.emailVerifiedAt) throw invalidCode();

    const valid = await this.database.db.transaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.vendorId, vendor.id))
        .limit(1)
        .for('update');
      const record = rows[0];
      const now = new Date();
      if (
        !record ||
        record.consumedAt ||
        record.expiresAt <= now ||
        record.attempts >= MAX_ATTEMPTS
      ) {
        return false;
      }

      const expectedHash = this.hashCode(vendor.id, code);
      if (!constantTimeHashEquals(record.codeHash, expectedHash)) {
        await transaction
          .update(emailVerificationCodes)
          .set({ attempts: record.attempts + 1 })
          .where(eq(emailVerificationCodes.vendorId, vendor.id));
        return false;
      }

      await transaction
        .update(emailVerificationCodes)
        .set({ consumedAt: now })
        .where(eq(emailVerificationCodes.vendorId, vendor.id));
      await this.vendors.markEmailVerified(vendor.id, transaction);
      return true;
    });

    if (!valid) throw invalidCode();
  }

  private hashCode(vendorId: string, code: string): string {
    return keyedHash(this.codeHashKey, `${vendorId}:${code}`);
  }
}

function invalidCode(): BadRequestException {
  return new BadRequestException('Verification code is invalid or expired');
}
