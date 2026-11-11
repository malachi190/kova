import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Logger as PinoLogger } from 'pino';
import { getCorrelationId } from '../correlation/correlation-context';
import { appLogger } from '../logger/logger';
import { ApiValidationException } from '../security/validation-pipe';

interface ErrorResponse {
  code: string;
  message: string;
  details: null;
  correlationId: string;
}

interface HttpResponse {
  status(code: number): this;
  json(body: ErrorResponse): this;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: Pick<PinoLogger, 'warn' | 'error'> = appLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const request = host.switchToHttp().getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const safeStatus =
      status >= 400 && status <= 599
        ? status
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = errorCode(exception, safeStatus);
    const diagnostics = {
      event: 'http_request_failed',
      status: safeStatus,
      code,
      method: safeMethod(request?.method),
      route: safeRoute(request),
      exceptionType: safeExceptionType(exception),
      ...(exception instanceof ApiValidationException
        ? { validationIssues: exception.issues }
        : {}),
    };

    if (safeStatus >= 500) {
      this.logger.error(diagnostics, 'HTTP request failed');
    } else {
      this.logger.warn(diagnostics, 'HTTP request failed');
    }

    response.status(safeStatus).json({
      code,
      message: safeMessageForStatus(safeStatus),
      details: null,
      correlationId: getCorrelationId(),
    });
  }
}

function safeMethod(method: string | undefined): string {
  return method && /^[A-Z]{1,12}$/.test(method) ? method : 'UNKNOWN';
}

function safeRoute(request: Request | undefined): string {
  const route = request?.route?.path;
  return typeof route === 'string' && route.startsWith('/')
    ? route
    : '<unmatched>';
}

function safeExceptionType(exception: unknown): string {
  const name = exception instanceof Error ? exception.name : typeof exception;
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : 'UnknownException';
}

function errorCode(exception: unknown, status: number): string {
  if (exception instanceof ApiValidationException) return 'VALIDATION_ERROR';
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED';
  return `HTTP_${status}`;
}

function safeMessageForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'Bad request';
    case HttpStatus.UNAUTHORIZED:
      return 'Unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'Forbidden';
    case HttpStatus.NOT_FOUND:
      return 'Not found';
    case HttpStatus.CONFLICT:
      return 'Conflict';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Too many requests';
    default:
      return status >= 500 ? 'Internal server error' : 'Request failed';
  }
}
