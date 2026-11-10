import { json, urlencoded, type RequestHandler } from 'express';
import type { ApiConfig, BodyLimitOverride } from '../config/env-config';

export function createRequestBodyParser(config: ApiConfig): RequestHandler {
  const overrides = [...config.bodyLimitOverrides].sort(
    (left, right) => right.prefix.length - left.prefix.length,
  );

  return (request, response, next) => {
    const limit = resolveRequestBodyLimit(
      request.path,
      config.BODY_LIMIT_BYTES,
      overrides,
    );
    const parser = isJsonRequest(request)
      ? json({ limit })
      : request.is('application/x-www-form-urlencoded')
        ? urlencoded({ extended: false, limit })
        : undefined;
    if (!parser) {
      next();
      return;
    }
    parser(request, response, next);
  };
}

export function resolveRequestBodyLimit(
  requestPath: string,
  defaultLimit: number,
  overrides: readonly BodyLimitOverride[],
): number {
  return (
    [...overrides]
      .sort((left, right) => right.prefix.length - left.prefix.length)
      .find(({ prefix }) => matchesPrefix(requestPath, prefix))?.bytes ??
    defaultLimit
  );
}

function matchesPrefix(requestPath: string, prefix: string): boolean {
  if (prefix === '/') return true;
  return requestPath === prefix || requestPath.startsWith(`${prefix}/`);
}

function isJsonRequest(request: Parameters<RequestHandler>[0]): boolean {
  return Boolean(
    request.is('application/json') || request.is('application/*+json'),
  );
}
