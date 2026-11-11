import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Response } from 'express';
import type { AuthConfig } from '../../common/config/env-config';
import { VendorsService } from '../vendors/vendors.service';
import { EmailVerificationCodeService } from './email-verification-code.service';
import type { RegisterVendorDto } from './dto/register-vendor.dto';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import { AuthSessionService } from './auth-session.service';
import { AUTH_CONFIG } from './auth.tokens';

export const REFRESH_COOKIE = 'kova_refresh';
export const ACCESS_COOKIE = 'kova_access';

@Injectable()
export class AuthService {
  constructor(
    private readonly vendors: VendorsService,
    private readonly verificationCodes: EmailVerificationCodeService,
    private readonly sessions: AuthSessionService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async register(input: RegisterVendorDto) {
    this.verificationCodes.assertReady();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const vendor = await this.vendors.register({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      storeName: input.storeName,
      ...(input.phone ? { phone: input.phone } : {}),
    });

    await this.verificationCodes.sendForVendor(vendor);
    return {
      id: vendor.id,
      email: vendor.email,
      fullName: vendor.fullName,
      storeName: vendor.storeName,
      phone: vendor.phone,
      status: vendor.status,
      emailVerified: false,
      createdAt: vendor.createdAt,
    };
  }

  async resendVerificationCode(email: string) {
    await this.verificationCodes.request(email);
    return {
      message: 'If this address can receive a code, one has been sent.',
    };
  }

  async verifyEmail(email: string, code: string) {
    await this.verificationCodes.verify(email, code);
    return { message: 'Email verified.' };
  }

  async login(input: LoginDto, response: Response) {
    const credentials = await this.authenticate(input);
    this.setCredentials(response, credentials);
    const vendor = await this.vendors.findForAuthentication(input.email);
    if (!vendor) throw new UnauthorizedException('Invalid email or password');
    return this.profile(vendor);
  }

  async refresh(refreshToken: string | undefined, response: Response) {
    if (!refreshToken)
      throw new UnauthorizedException('Refresh session is required');
    const credentials = await this.sessions.refresh(refreshToken);
    this.setCredentials(response, credentials);
    return { message: 'Session refreshed.' };
  }

  async logout(refreshToken: string | undefined, response: Response) {
    await this.sessions.revoke(refreshToken);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions('/api/v1/auth'));
    response.clearCookie(ACCESS_COOKIE, this.cookieOptions('/api/v1'));
    return { message: 'Signed out.' };
  }

  async changePassword(
    refreshToken: string | undefined,
    input: ChangePasswordDto,
    response: Response,
  ) {
    const vendorId =
      await this.sessions.findVendorForRefreshToken(refreshToken);
    const vendor = await this.vendors.findForAuthenticationById(vendorId);
    if (
      !vendor ||
      !(await argon2.verify(vendor.passwordHash, input.oldPassword))
    ) {
      throw new UnauthorizedException('Current password is invalid');
    }
    const nextHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
    });
    await this.vendors.changePassword(
      vendor.id,
      vendor.passwordHash,
      nextHash,
      (transaction) =>
        this.sessions.revokeVendorInTransaction(vendor.id, transaction),
    );
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions('/api/v1/auth'));
    response.clearCookie(ACCESS_COOKIE, this.cookieOptions('/api/v1'));
    return { message: 'Password changed. Sign in again.' };
  }

  private async authenticate(input: LoginDto) {
    const vendor = await this.vendors.findForAuthentication(input.email);
    const valid = vendor
      ? await argon2.verify(vendor.passwordHash, input.password)
      : await hashUnknownAccountPassword(input.password);
    if (!vendor || !valid) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!vendor.emailVerifiedAt)
      throw new ForbiddenException('Email verification is required');
    if (vendor.status === 'FROZEN')
      throw new ForbiddenException('This account is unavailable');
    const credentials = await this.sessions.create(vendor.id);
    return credentials;
  }

  private profile(
    vendor: NonNullable<
      Awaited<ReturnType<VendorsService['findForAuthentication']>>
    >,
  ) {
    return {
      id: vendor.id,
      email: vendor.email,
      fullName: vendor.fullName,
      storeName: vendor.storeName,
      phone: vendor.phone,
      status: vendor.status,
      emailVerified: Boolean(vendor.emailVerifiedAt),
    };
  }

  private setCredentials(
    response: Response,
    credentials: { accessToken: string; refreshToken: string },
  ) {
    response.cookie(ACCESS_COOKIE, credentials.accessToken, {
      ...this.cookieOptions('/api/v1'),
      maxAge: 15 * 60 * 1000,
    });
    response.cookie(REFRESH_COOKIE, credentials.refreshToken, {
      ...this.cookieOptions('/api/v1/auth'),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions(path: '/api/v1' | '/api/v1/auth') {
    return {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'lax' as const,
      path,
    };
  }
}

async function hashUnknownAccountPassword(password: string): Promise<boolean> {
  await argon2.hash(password, { type: argon2.argon2id });
  return false;
}
