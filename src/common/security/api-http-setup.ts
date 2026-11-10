import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { ApiConfig } from '../config/env-config';
import { ApiExceptionFilter } from '../errors/api-exception.filter';
import { correlationIdMiddleware } from '../correlation/correlation-id.middleware';
import { bodyParserErrorMiddleware } from './body-parser-error.middleware';
import { createRequestBodyParser } from './request-body-parser';
import { createApiValidationPipe } from './validation-pipe';

export function configureApiHttp(
  app: NestExpressApplication,
  config: ApiConfig,
): void {
  app.set('trust proxy', config.trustProxy);
  app.use(
    config.NODE_ENV === 'production' ? helmet() : helmet({ hsts: false }),
  );
  app.enableCors({
    origin: config.corsOrigins,
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
    credentials: false,
  });
  app.use(correlationIdMiddleware);
  app.use(createRequestBodyParser(config));
  app.use(bodyParserErrorMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(createApiValidationPipe());
}
