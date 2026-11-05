import assert from 'node:assert/strict';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import test from 'node:test';
import { runWithCorrelationId } from '../../src/common/correlation/correlation-context';
import { ApiExceptionFilter } from '../../src/common/errors/api-exception.filter';

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

  runWithCorrelationId(correlationId, () => {
    new ApiExceptionFilter().catch(
      new BadRequestException('must not echo a possibly sensitive message'),
      host,
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

  new ApiExceptionFilter().catch(new Error('private failure details'), host);

  assert.ok(body && typeof body === 'object');
  const errorBody = body as Record<string, unknown>;
  assert.equal(errorBody['code'], 'HTTP_500');
  assert.equal(errorBody['message'], 'Internal server error');
  assert.equal(errorBody['details'], null);
  assert.match(
    String(errorBody['correlationId']),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.equal(JSON.stringify(body).includes('private failure'), false);
});
