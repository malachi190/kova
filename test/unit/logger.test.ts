import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import test from 'node:test';
import type { Request } from 'express';
import { runWithCorrelationId } from '../../src/common/correlation/correlation-context';
import { correlationIdMiddleware } from '../../src/common/correlation/correlation-id.middleware';
import { bodyParserErrorMiddleware } from '../../src/common/security/body-parser-error.middleware';
import {
  appLogger,
  createLogger,
  ERROR_LOG_FILE,
  PinoNestLogger,
} from '../../src/common/logger/logger';

test('application warnings and errors are appended to the local error log', async () => {
  const marker = `error-log-test-${randomUUID()}`;
  appLogger.warn({ event: marker, status: 400 }, 'HTTP request failed');
  await new Promise<void>((resolve, reject) => {
    appLogger.flush((error) => (error ? reject(error) : resolve()));
  });

  const contents = await readFile(ERROR_LOG_FILE, 'utf8');
  assert.ok(contents.includes(marker));
});

test('body parser failures write status and correlation ID to the error log', async () => {
  const correlationId = randomUUID();
  let statusCode = 0;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  runWithCorrelationId(correlationId, () => {
    bodyParserErrorMiddleware(
      { status: 413 },
      { method: 'POST' } as Request,
      response as never,
      () => assert.fail('known body parser failure should be handled'),
    );
  });
  assert.equal(statusCode, 413);
  await new Promise<void>((resolve, reject) => {
    appLogger.flush((error) => (error ? reject(error) : resolve()));
  });

  const contents = await readFile(ERROR_LOG_FILE, 'utf8');
  const failureRecord = contents
    .split('\n')
    .find((line) => line.includes(correlationId));
  assert.ok(failureRecord);
  assert.match(failureRecord, /"code":"HTTP_413"/);
  assert.match(failureRecord, /"exceptionType":"BodyParserError"/);
});

test('Nest error logs omit raw exception messages', async () => {
  const correlationId = randomUUID();
  runWithCorrelationId(correlationId, () => {
    new PinoNestLogger().error('Error: private-error-message-sentinel');
  });
  await new Promise<void>((resolve, reject) => {
    appLogger.flush((error) => (error ? reject(error) : resolve()));
  });

  const contents = await readFile(ERROR_LOG_FILE, 'utf8');
  const failureRecord = contents
    .split('\n')
    .find((line) => line.includes(correlationId));
  assert.ok(failureRecord);
  assert.match(failureRecord, /"msg":"Error"/);
  assert.equal(failureRecord.includes('private-error-message-sentinel'), false);
});

test('JSON logs include a correlation ID and redact sensitive fields', () => {
  let output = '';
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger(destination);
  const correlationId = '9f207249-4f61-4a84-a4e8-104c037be107';

  runWithCorrelationId(correlationId, () => {
    logger.info(
      {
        password: 'password-sentinel',
        token: 'token-sentinel',
        bvn: 'bvn-sentinel',
        otp: 'otp-sentinel',
        nested: { refreshToken: 'refresh-sentinel' },
      },
      'request completed',
    );
  });

  const log = JSON.parse(output) as Record<string, unknown>;
  assert.equal(log['correlationId'], correlationId);
  assert.equal(log['password'], '[REDACTED]');
  assert.equal(
    log['nested'] && (log['nested'] as Record<string, unknown>)['refreshToken'],
    '[REDACTED]',
  );
  for (const sentinel of [
    'password-sentinel',
    'token-sentinel',
    'bvn-sentinel',
    'otp-sentinel',
    'refresh-sentinel',
  ]) {
    assert.equal(output.includes(sentinel), false);
  }
});

test('correlation middleware accepts UUIDs and creates an ID for invalid input', () => {
  let acceptedId = '';
  const acceptedResponse = createMockResponse();
  correlationIdMiddleware(
    { header: () => '9f207249-4f61-4a84-a4e8-104c037be107' } as never,
    acceptedResponse as never,
    () => {
      acceptedId = acceptedResponse.headers['x-correlation-id'] ?? '';
    },
  );
  assert.equal(acceptedId, '9f207249-4f61-4a84-a4e8-104c037be107');

  let generatedId = '';
  const generatedResponse = createMockResponse();
  correlationIdMiddleware(
    { header: () => 'invalid\nheader' } as never,
    generatedResponse as never,
    () => {
      generatedId = generatedResponse.headers['x-correlation-id'] ?? '';
    },
  );
  assert.match(
    generatedId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

function createMockResponse() {
  return {
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}
