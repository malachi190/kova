import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithCorrelationId } from './correlation-context';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correlationIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.header('x-correlation-id');
  const correlationId =
    supplied && UUID_PATTERN.test(supplied) ? supplied : randomUUID();

  response.setHeader('x-correlation-id', correlationId);
  runWithCorrelationId(correlationId, next);
}
