import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createSchedulerApplication() {
  return NestFactory.createApplicationContext(AppModule);
}

export async function bootstrapScheduler(): Promise<void> {
  await createSchedulerApplication();
}

if (require.main === module) {
  void bootstrapScheduler();
}
