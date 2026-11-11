import { createHmac, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull } from 'drizzle-orm';
import { authSessions } from '../../db/schema/auth-sessions';
import { authSessionRefreshTokens } from '../../db/schema/auth-session-refresh-tokens';
import { createDatabase } from '../../db/database';
import { deriveAuthKey, keyedHash } from './auth-crypto';
import { AUTH_CONFIG } from './auth.tokens';
import type { AuthConfig } from '../../common/config/env-config';
import { AuthDatabase } from './auth.database';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthSessionService {
  private readonly refreshKey: Buffer;

  constructor(
    private readonly database: AuthDatabase,
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) config: AuthConfig,
  ) {
    this.refreshKey = deriveAuthKey(config, 'refresh-token');
  }

  async create(vendorId: string) {
    const id = randomUUID();
    const refreshToken = this.tokenFor(id, 0);
    const now = new Date();
    const [session] = await this.database.db
      .insert(authSessions)
      .values({
        id,
        vendorId,
        refreshTokenHash: keyedHash(this.refreshKey, refreshToken),
        expiresAt: new Date(now.getTime() + SESSION_MS),
      })
      .returning({ id: authSessions.id });
    if (!session) throw new Error('Could not create authentication session');
    return this.credentials(vendorId, session.id, refreshToken);
  }

  async refresh(refreshToken: string) {
    const tokenHash = keyedHash(this.refreshKey, refreshToken);
    const result = await this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.refreshTokenHash, tokenHash),
            isNull(authSessions.revokedAt),
          ),
        )
        .limit(1)
        .for('update');
      if (!session) {
        const [historical] = await tx
          .select({ session: authSessions })
          .from(authSessionRefreshTokens)
          .innerJoin(
            authSessions,
            eq(authSessionRefreshTokens.sessionId, authSessions.id),
          )
          .where(eq(authSessionRefreshTokens.tokenHash, tokenHash))
          .limit(1)
          .for('update');
        if (historical && !historical.session.revokedAt) {
          await tx
            .update(authSessions)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(eq(authSessions.id, historical.session.id));
          return { reuseDetected: true as const };
        }
        throw new UnauthorizedException('Invalid refresh session');
      }
      if (session.expiresAt <= new Date()) {
        throw new UnauthorizedException('Invalid refresh session');
      }

      const nextVersion = session.tokenVersion + 1;
      const nextToken = this.tokenFor(session.id, nextVersion);
      await tx.insert(authSessionRefreshTokens).values({
        sessionId: session.id,
        tokenHash: session.refreshTokenHash,
        replacedByVersion: nextVersion,
      });
      await tx
        .update(authSessions)
        .set({
          previousRefreshTokenHash: session.refreshTokenHash,
          refreshTokenHash: keyedHash(this.refreshKey, nextToken),
          tokenVersion: nextVersion,
          expiresAt: new Date(Date.now() + SESSION_MS),
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(authSessions.id, session.id));
      return {
        credentials: await this.credentialsForSession(
          tx,
          session.vendorId,
          session.id,
        ),
      };
    });
    if ('reuseDetected' in result) {
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    return result.credentials;
  }

  async revoke(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = keyedHash(this.refreshKey, refreshToken);
    await this.database.db
      .update(authSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          isNull(authSessions.revokedAt),
          eq(authSessions.refreshTokenHash, tokenHash),
        ),
      );
    const [historical] = await this.database.db
      .select({ sessionId: authSessionRefreshTokens.sessionId })
      .from(authSessionRefreshTokens)
      .where(eq(authSessionRefreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (historical) {
      await this.database.db
        .update(authSessions)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(authSessions.id, historical.sessionId),
            isNull(authSessions.revokedAt),
          ),
        );
    }
  }

  async revokeVendor(vendorId: string): Promise<void> {
    await this.database.db
      .update(authSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(authSessions.vendorId, vendorId),
          isNull(authSessions.revokedAt),
        ),
      );
  }

  async revokeVendorInTransaction(
    vendorId: string,
    transaction: Parameters<
      Parameters<ReturnType<typeof createDatabase>['db']['transaction']>[0]
    >[0],
  ): Promise<void> {
    await transaction
      .update(authSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(authSessions.vendorId, vendorId),
          isNull(authSessions.revokedAt),
        ),
      );
  }

  async findVendorForRefreshToken(
    refreshToken: string | undefined,
  ): Promise<string> {
    if (!refreshToken)
      throw new UnauthorizedException('Refresh session is required');
    const [session] = await this.database.db
      .select({
        vendorId: authSessions.vendorId,
        expiresAt: authSessions.expiresAt,
      })
      .from(authSessions)
      .where(
        and(
          eq(
            authSessions.refreshTokenHash,
            keyedHash(this.refreshKey, refreshToken),
          ),
          isNull(authSessions.revokedAt),
        ),
      )
      .limit(1);
    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh session');
    }
    return session.vendorId;
  }

  private async credentialsForSession(
    tx: Parameters<
      Parameters<ReturnType<typeof createDatabase>['db']['transaction']>[0]
    >[0],
    vendorId: string,
    sessionId: string,
  ) {
    const [session] = await tx
      .select({ tokenVersion: authSessions.tokenVersion })
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .limit(1);
    if (!session) throw new UnauthorizedException('Invalid refresh session');
    return this.credentials(
      vendorId,
      sessionId,
      this.tokenFor(sessionId, session.tokenVersion),
    );
  }

  private tokenFor(sessionId: string, version: number): string {
    const value = `${sessionId}.${version}`;
    const signature = createHmac('sha256', this.refreshKey)
      .update(value)
      .digest('base64url');
    return `${value}.${signature}`;
  }

  private credentials(
    vendorId: string,
    sessionId: string,
    refreshToken: string,
  ) {
    const accessToken = this.jwt.sign(
      { sub: vendorId, sid: sessionId },
      { expiresIn: '15m' },
    );
    return { accessToken, refreshToken };
  }
}
