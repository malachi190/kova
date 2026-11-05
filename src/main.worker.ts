import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadRuntimeConfig } from './common/config/env-config';

export async function createWorkerApplication() {
  return NestFactory.createApplicationContext(AppModule);
}

export async function bootstrapWorker(): Promise<void> {
  loadRuntimeConfig();
  const app = await createWorkerApplication();
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
}

if (require.main === module) {
  void bootstrapWorker();
}
