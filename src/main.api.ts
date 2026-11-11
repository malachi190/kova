import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiAppModule } from './api-app.module';
import type { EmailSender } from './modules/auth/email-sender';
import { loadApiConfig, type ApiConfig } from './common/config/env-config';
import { configureApiHttp } from './common/security/api-http-setup';
import { PinoNestLogger } from './common/logger/logger';

export async function createApiApplication(
  config: ApiConfig = loadApiConfig(),
  emailSender?: EmailSender,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    ApiAppModule.register(config.auth, emailSender),
    { logger: new PinoNestLogger(), bodyParser: false },
  );
  configureApiHttp(app, config);
  return app;
}

export async function bootstrapApi(): Promise<void> {
  const config = loadApiConfig();
  const app = await createApiApplication(config);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  await app.listen(config.PORT, '0.0.0.0');
}

if (require.main === module) {
  void bootstrapApi();
}
