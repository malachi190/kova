import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadApiConfig } from './common/config/env-config';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { correlationIdMiddleware } from './common/correlation/correlation-id.middleware';
import { PinoNestLogger } from './common/logger/logger';

export async function createApiApplication() {
  const app = await NestFactory.create(AppModule, {
    logger: new PinoNestLogger(),
  });
  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
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
