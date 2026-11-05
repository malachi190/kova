import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createWorkerApplication() {
  return NestFactory.createApplicationContext(AppModule);
}

export async function bootstrapWorker(): Promise<void> {
  const app = await createWorkerApplication();
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
}

if (require.main === module) {
  void bootstrapWorker();
}
