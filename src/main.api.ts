import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadApiConfig, type ApiConfig } from './common/config/env-config';
import { bodyParserErrorMiddleware } from './common/security/body-parser-error.middleware';
import { REQUEST_BODY_LIMIT_BYTES } from './common/security/security-defaults';
import { createApiValidationPipe } from './common/security/validation-pipe';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { correlationIdMiddleware } from './common/correlation/correlation-id.middleware';
import { PinoNestLogger } from './common/logger/logger';

export async function createApiApplication(
  config: ApiConfig = loadApiConfig(),
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new PinoNestLogger(),
    bodyParser: false,
  });
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'x-correlation-id',
    ],
    exposedHeaders: [
      'x-correlation-id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
  });
  app.use(correlationIdMiddleware);
  app.useBodyParser('json', { limit: REQUEST_BODY_LIMIT_BYTES });
  app.useBodyParser('urlencoded', {
    extended: false,
    limit: REQUEST_BODY_LIMIT_BYTES,
  });
  app.use(bodyParserErrorMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(createApiValidationPipe());
  return app;
}

export async function bootstrapApi(): Promise<void> {
  const config = loadApiConfig();
  const app = await createApiApplication(config);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  await app.listen(config.PORT, '0.0.0.0');
}

if (require.main === module) {
  void bootstrapApi();
}
