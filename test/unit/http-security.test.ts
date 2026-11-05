import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { IsString } from 'class-validator';
import test from 'node:test';
import { createApiValidationPipe } from '../../src/common/security/validation-pipe';
import { createApiApplication } from '../../src/main.api';
import { createTestApiConfig } from '../helpers/api-config';

test('API applies Helmet headers and allows only the configured CORS origin', async () => {
  const app = await createApiApplication(createTestApiConfig());

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/health`;

    const allowed = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3001',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,idempotency-key',
      },
    });
    assert.equal(allowed.status, 204);
    assert.equal(
      allowed.headers.get('access-control-allow-origin'),
      'http://localhost:3001',
    );
    assert.match(
      allowed.headers.get('access-control-allow-headers') ?? '',
      /idempotency-key/i,
    );
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(allowed.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(allowed.headers.get('x-powered-by'), null);

    const denied = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert.notEqual(
      denied.headers.get('access-control-allow-origin'),
      'https://attacker.example',
    );
  } finally {
    await app.close();
  }
});

test('request bodies above 100 KB receive the standard 413 response', async () => {
  const app = await createApiApplication(createTestApiConfig());

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const correlationId = '9f207249-4f61-4a84-a4e8-104c037be107';
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify({ value: 'x'.repeat(100 * 1024) }),
    });

    assert.equal(response.status, 413);
    assert.equal(response.headers.get('x-correlation-id'), correlationId);
    assert.deepEqual(await response.json(), {
      code: 'HTTP_413',
      message: 'Request body is too large',
      details: null,
      correlationId,
    });
  } finally {
    await app.close();
  }
});

test('global validation rejects unknown DTO fields', async () => {
  class ExampleDto {
    @IsString()
    name!: string;
  }

  const pipe = createApiValidationPipe();
  await assert.rejects(
    pipe.transform(
      { name: 'Kova', unexpected: 'value' },
      { type: 'body', metatype: ExampleDto, data: undefined },
    ),
    BadRequestException,
  );
  const transformed = await pipe.transform(
    { name: 'Kova' },
    { type: 'body', metatype: ExampleDto, data: undefined },
  );
  assert.ok(transformed instanceof ExampleDto);
  assert.equal(transformed.name, 'Kova');
});
