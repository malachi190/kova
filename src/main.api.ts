import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createApiApplication() {
  return NestFactory.create(AppModule);
}

export async function bootstrapApi(): Promise<void> {
  const app = await createApiApplication();
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

if (require.main === module) {
  void bootstrapApi();
}
