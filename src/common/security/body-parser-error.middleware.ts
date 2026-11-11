import type { ErrorRequestHandler } from 'express';
import { getCorrelationId } from '../correlation/correlation-context';
import { appLogger } from '../logger/logger';

export const bodyParserErrorMiddleware: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  const status = readBodyParserStatus(error);
  if (status === undefined) {
    next(error);
    return;
  }

  appLogger.warn(
    {
      event: 'http_request_failed',
      status,
      code: status === 413 ? 'HTTP_413' : 'HTTP_400',
      method: request.method,
      route:
        typeof request.route?.path === 'string'
          ? request.route.path
          : '<unmatched>',
      exceptionType: 'BodyParserError',
    },
    'HTTP request failed',
  );

  response.status(status).json({
    code: status === 413 ? 'HTTP_413' : 'HTTP_400',
    message: status === 413 ? 'Request body is too large' : 'Bad request',
    details: null,
    correlationId: getCorrelationId(),
  });
};

function readBodyParserStatus(error: unknown): 400 | 413 | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const status = 'status' in error ? error.status : undefined;
  if (status === 413) return 413;
  if (status === 400) return 400;
  return undefined;
}
