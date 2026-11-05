import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createWorkerApplication() {
  return NestFactory.createApplicationContext(AppModule);
}

export async function bootstrapWorker(): Promise<void> {
  await createWorkerApplication();
}

if (require.main === module) {
  void bootstrapWorker();
}
