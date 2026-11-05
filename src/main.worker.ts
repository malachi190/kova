import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadRuntimeConfig } from './common/config/env-config';
import { PinoNestLogger } from './common/logger/logger';

export async function createWorkerApplication() {
  return NestFactory.createApplicationContext(AppModule, {
    logger: new PinoNestLogger(),
  });
}

export async function bootstrapWorker(): Promise<void> {
  loadRuntimeConfig();
  const app = await createWorkerApplication();
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
}

if (require.main === module) {
  void bootstrapWorker();
}
