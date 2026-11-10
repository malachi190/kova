import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { getCorrelationId } from '../correlation/correlation-context';
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
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const safeStatus =
      status >= 400 && status <= 599
        ? status
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(safeStatus).json({
      code: errorCode(exception, safeStatus),
      message: safeMessageForStatus(safeStatus),
      details: null,
      correlationId: getCorrelationId(),
    });
  }
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
