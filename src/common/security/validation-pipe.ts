import { BadRequestException, ValidationPipe } from '@nestjs/common';

export class ApiValidationException extends BadRequestException {
  constructor() {
    super('Request validation failed');
  }
}

export function createApiValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: () => new ApiValidationException(),
  });
}
