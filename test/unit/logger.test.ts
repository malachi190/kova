import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';
import { runWithCorrelationId } from '../../src/common/correlation/correlation-context';
import { correlationIdMiddleware } from '../../src/common/correlation/correlation-id.middleware';
import { createLogger } from '../../src/common/logger/logger';

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
