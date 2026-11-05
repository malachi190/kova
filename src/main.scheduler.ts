import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadRuntimeConfig } from './common/config/env-config';

export async function createSchedulerApplication() {
  return NestFactory.createApplicationContext(AppModule);
}

export async function bootstrapScheduler(): Promise<void> {
  loadRuntimeConfig();
  const app = await createSchedulerApplication();
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
}

if (require.main === module) {
  void bootstrapScheduler();
}
