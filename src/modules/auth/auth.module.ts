import { DynamicModule, Module } from '@nestjs/common';
import type { AuthConfig } from '../../common/config/env-config';
import { AuthController } from './auth.controller';
import { AUTH_CONFIG } from './auth.tokens';
import { AuthDatabase } from './auth.database';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';
import { JwtModule } from '@nestjs/jwt';
import { EmailVerificationCodeService } from './email-verification-code.service';
import {
  EMAIL_SENDER,
  ResendEmailSender,
  type EmailSender,
} from './email-sender';
import { VendorsModule } from '../vendors/vendors.module';

@Module({})
export class AuthModule {
  static register(
    config: AuthConfig,
    emailSender?: EmailSender,
  ): DynamicModule {
    return {
      module: AuthModule,
      imports: [VendorsModule, JwtModule.register({ secret: config.secret })],
      controllers: [AuthController],
      providers: [
        { provide: AUTH_CONFIG, useValue: config },
        {
          provide: EMAIL_SENDER,
          useValue: emailSender ?? new ResendEmailSender(config),
        },
        AuthDatabase,
        EmailVerificationCodeService,
        AuthSessionService,
        AuthService,
      ],
    };
  }
}
