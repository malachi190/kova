import { DynamicModule, Module } from '@nestjs/common';
import type { AuthConfig } from './common/config/env-config';
import { AppModule } from './app.module';
import { AuthModule } from './modules/auth/auth.module';
import type { EmailSender } from './modules/auth/email-sender';

@Module({})
export class ApiAppModule {
  static register(
    authConfig: AuthConfig,
    emailSender?: EmailSender,
  ): DynamicModule {
    return {
      module: ApiAppModule,
      imports: [AppModule, AuthModule.register(authConfig, emailSender)],
    };
  }
}
