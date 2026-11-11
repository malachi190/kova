import assert from 'node:assert/strict';
import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import test from 'node:test';
import { firstValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from '../../src/common/idempotency/idempotency.interceptor';
import {
  hashIdempotentRequest,
  type ResponseToStore,
} from '../../src/common/idempotency/idempotency.service';
import { PAYMENT_IDEMPOTENCY_METADATA } from '../../src/common/idempotency/payment-idempotency.decorator';

test('request hashing is stable across object key ordering and changes with request data', () => {
  const first = hashIdempotentRequest({
    method: 'POST',
    route: '/v1/deals',
    body: { price: 100, item: 'Bag' },
  });
  const sameRequest = hashIdempotentRequest({
    body: { item: 'Bag', price: 100 },
    route: '/v1/deals',
    method: 'POST',
  });
  const changedRequest = hashIdempotentRequest({
    method: 'POST',
    route: '/v1/deals',
    body: { price: 101, item: 'Bag' },
  });

  assert.equal(first, sameRequest);
  assert.notEqual(first, changedRequest);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test('payment POST interceptor requires an Idempotency-Key header', () => {
  const interceptor = new IdempotencyInterceptor({} as never);
  const context = createExecutionContext({
    method: 'POST',
    header: undefined,
    paymentEndpoint: true,
  });

  assert.throws(
    () => interceptor.intercept(context, { handle: () => of(null) }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal(error.name, 'IdempotencyKeyRequiredException');
      return true;
    },
  );
});

test('non-payment POST passes through without idempotency persistence, with or without a key', async () => {
  let persistenceCalled = false;
  const interceptor = new IdempotencyInterceptor({
    async execute() {
      persistenceCalled = true;
      throw new Error('Non-payment POST must bypass persistence');
    },
  } as never);
  for (const header of [undefined, 'unused-non-payment-key']) {
    const context = createExecutionContext({ method: 'POST', header });
    const result = await firstValueFrom(
      interceptor.intercept(context, { handle: () => of({ accepted: true }) }),
    );
    assert.deepEqual(result, { accepted: true });
  }
  assert.equal(persistenceCalled, false);
});

test('POST interceptor uses the route template and returns the stored status', async () => {
  let observedScope = '';
  let observedKey = '';
  let observedHash = '';
  let statusCode = 201;
  const interceptor = new IdempotencyInterceptor({
    async execute(
      scope: string,
      key: string,
      requestHash: string,
      action: () => Promise<ResponseToStore>,
    ) {
      observedScope = scope;
      observedKey = key;
      observedHash = requestHash;
      const result = await action();
      return { ...result, replayed: false };
    },
  } as never);
  const context = createExecutionContext(
    {
      method: 'POST',
      header: 'once-key',
      body: { amount: 2500 },
      routePath: '/deals/:token/pay',
      actualPath: '/deals/link-secret/pay',
      paymentEndpoint: true,
    },
    (value) => {
      statusCode = value;
    },
  );

  const body = await firstValueFrom(
    interceptor.intercept(context, {
      handle: () => of({ result: 'accepted' }),
    }),
  );

  assert.equal(body && (body as Record<string, unknown>)['result'], 'accepted');
  assert.equal(observedScope, 'POST:/v1/deals/:token/pay');
  assert.equal(observedKey, 'once-key');
  assert.match(observedHash, /^[0-9a-f]{64}$/);
  assert.equal(statusCode, 201);
});

function createExecutionContext(
  input: {
    method: string;
    header: string | undefined;
    body?: unknown;
    routePath?: string;
    actualPath?: string;
    paymentEndpoint?: boolean;
  },
  setStatus?: (status: number) => void,
): ExecutionContext {
  const request = {
    method: input.method,
    get: () => input.header,
    body: input.body,
    query: {},
    baseUrl: '/v1',
    path: input.actualPath ?? '/v1/test',
    route: input.routePath ? { path: input.routePath } : undefined,
  };
  const handler = () => undefined;
  if (input.paymentEndpoint) {
    Reflect.defineMetadata(PAYMENT_IDEMPOTENCY_METADATA, true, handler);
  }
  const response = {
    statusCode: 201,
    status(code: number) {
      setStatus?.(code);
      return this;
    },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}
