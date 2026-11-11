import assert from 'node:assert/strict';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import type { Logger as PinoLogger } from 'pino';
import test from 'node:test';
import { runWithCorrelationId } from '../../src/common/correlation/correlation-context';
import { ApiExceptionFilter } from '../../src/common/errors/api-exception.filter';
import { ApiValidationException } from '../../src/common/security/validation-pipe';

test('API exception filter uses the standard safe error format', () => {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  const correlationId = '9f207249-4f61-4a84-a4e8-104c037be107';
  const entries: Array<Record<string, unknown>> = [];
  const logger = {
    warn: (fields: Record<string, unknown>) => entries.push(fields),
    error: (fields: Record<string, unknown>) => entries.push(fields),
  } as unknown as Pick<PinoLogger, 'warn' | 'error'>;

  runWithCorrelationId(correlationId, () => {
    new ApiExceptionFilter(logger).catch(
      new BadRequestException('must not echo a possibly sensitive message'),
      withRequest(host, 'POST', '/api/v1/auth/register'),
    );
  });

  assert.equal(statusCode, 400);
  assert.deepEqual(body, {
    code: 'HTTP_400',
    message: 'Bad request',
    details: null,
    correlationId,
  });
  assert.equal(JSON.stringify(body).includes('possibly sensitive'), false);
  assert.deepEqual(entries[0], {
    event: 'http_request_failed',
    status: 400,
    code: 'HTTP_400',
    method: 'POST',
    route: '/api/v1/auth/register',
    exceptionType: 'BadRequestException',
  });
});

test('unexpected exceptions return a generic server error', () => {
  let body: unknown;
  const response = {
    status() {
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  const entries: Array<Record<string, unknown>> = [];
  const logger = {
    warn: (fields: Record<string, unknown>) => entries.push(fields),
    error: (fields: Record<string, unknown>) => entries.push(fields),
  } as unknown as Pick<PinoLogger, 'warn' | 'error'>;

  new ApiExceptionFilter(logger).catch(
    new Error('private failure details'),
    withRequest(host, 'POST', '/api/v1/auth/register'),
  );

  assert.ok(body && typeof body === 'object');
  const errorBody = body as Record<string, unknown>;
  assert.equal(errorBody['code'], 'HTTP_500');
  assert.equal(errorBody['message'], 'Internal server error');
  assert.equal(errorBody['details'], null);
  assert.equal(entries[0]?.['exceptionType'], 'Error');
  assert.equal(JSON.stringify(entries).includes('private failure'), false);
  assert.match(
    String(errorBody['correlationId']),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.equal(JSON.stringify(body).includes('private failure'), false);
});

test('validation failure logs safe field and constraint names only', () => {
  const entries: Array<Record<string, unknown>> = [];
  const logger = {
    warn: (fields: Record<string, unknown>) => entries.push(fields),
    error: (fields: Record<string, unknown>) => entries.push(fields),
  } as unknown as Pick<PinoLogger, 'warn' | 'error'>;
  const response = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        method: 'POST',
        route: { path: '/api/v1/auth/register' },
      }),
    }),
  } as unknown as ArgumentsHost;

  new ApiExceptionFilter(logger).catch(
    new ApiValidationException([
      { field: 'email', constraints: ['isEmail'] },
      { field: '<unknown>', constraints: ['whitelistValidation'] },
    ]),
    host,
  );

  assert.deepEqual(entries[0]?.['validationIssues'], [
    { field: 'email', constraints: ['isEmail'] },
    { field: '<unknown>', constraints: ['whitelistValidation'] },
  ]);
});

function withRequest(
  host: ArgumentsHost,
  method: string,
  route: string,
): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => host.switchToHttp().getResponse(),
      getRequest: () => ({ method, route: { path: route } }),
    }),
  } as unknown as ArgumentsHost;
}
