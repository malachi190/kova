import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { firstValueFrom, from, type Observable } from 'rxjs';
import {
  hashIdempotentRequest,
  IdempotencyService,
} from './idempotency.service';
import { PAYMENT_IDEMPOTENCY_METADATA } from './payment-idempotency.decorator';

interface RequestPrincipal {
  id?: unknown;
  sub?: unknown;
}

type RequestWithPrincipal = Request & { user?: RequestPrincipal };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithPrincipal>();
    const response = http.getResponse<Response>();

    if (
      request.method.toUpperCase() !== 'POST' ||
      !isPaymentIdempotent(context)
    ) {
      return next.handle();
    }

    const key = readIdempotencyKey(request);
    const route = readRouteTemplate(request);
    const principalId = request.user?.id ?? request.user?.sub;
    const scopeSuffix =
      typeof principalId === 'string' ? `:${principalId}` : '';
    const scope = `${request.method.toUpperCase()}:${route}${scopeSuffix}`;
    if (scope.length > 255) {
      throw new InternalServerErrorException(
        'Idempotency scope exceeds storage limits',
      );
    }

    const requestHash = hashIdempotentRequest({
      method: request.method.toUpperCase(),
      route,
      query: request.query,
      body: request.body,
    });

    return from(
      this.idempotency
        .execute(scope, key, requestHash, async () => ({
          status: response.statusCode,
          body: await firstValueFrom(next.handle()),
        }))
        .then((result) => {
          response.status(result.status);
          return result.body;
        }),
    );
  }
}

function isPaymentIdempotent(context: ExecutionContext): boolean {
  const getHandler = context.getHandler;
  if (typeof getHandler !== 'function') return false;
  const handler = getHandler.call(context) as object;
  return Reflect.getMetadata(PAYMENT_IDEMPOTENCY_METADATA, handler) === true;
}

function readIdempotencyKey(request: Request): string {
  const value = request.get('idempotency-key');
  if (!value || value.length > 255 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new IdempotencyKeyRequiredException();
  }
  return value;
}

class IdempotencyKeyRequiredException extends BadRequestException {
  constructor() {
    super('A valid Idempotency-Key header is required');
  }
}

function readRouteTemplate(request: Request): string {
  const routePath = request.route?.path;
  const path = Array.isArray(routePath)
    ? routePath.find((entry): entry is string => typeof entry === 'string')
    : routePath;
  if (typeof path !== 'string') {
    throw new InternalServerErrorException(
      'Could not determine the request route',
    );
  }
  return `${request.baseUrl}${path}`;
}
