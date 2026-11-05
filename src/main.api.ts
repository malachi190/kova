import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadApiConfig } from './common/config/env-config';

export async function createApiApplication() {
  return NestFactory.create(AppModule);
}

export async function bootstrapApi(): Promise<void> {
  const config = loadApiConfig();
  const app = await createApiApplication();
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  await app.listen(config.PORT, '0.0.0.0');
}

if (require.main === module) {
  void bootstrapApi();
}
