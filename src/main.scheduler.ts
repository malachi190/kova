import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createSchedulerApplication() {
  return NestFactory.createApplicationContext(AppModule);
}

export async function bootstrapScheduler(): Promise<void> {
  const app = await createSchedulerApplication();
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
}

if (require.main === module) {
  void bootstrapScheduler();
}
