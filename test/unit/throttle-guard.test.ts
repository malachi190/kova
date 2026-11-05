import assert from 'node:assert/strict';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import test from 'node:test';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Controller('throttle-test')
class ThrottleTestController {
  @Get()
  standardRoute() {
    return { status: 'ok' };
  }

  @Get('strict')
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  strictRoute() {
    return { status: 'ok' };
  }
}

class MemoryThrottlerStorage implements ThrottlerStorage {
  private readonly records = new Map<
    string,
    { totalHits: number; expiresAt: number; blockedUntil: number }
  >();

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storageKey = `${throttlerName}:${key}`;
    const now = Date.now();
    let record = this.records.get(storageKey);
    if (!record || record.expiresAt <= now) {
      record = { totalHits: 0, expiresAt: now + ttl, blockedUntil: 0 };
      this.records.set(storageKey, record);
    }

    record.totalHits += 1;
    if (record.totalHits > limit && record.blockedUntil <= now) {
      record.blockedUntil = now + blockDuration;
    }

    return {
      totalHits: record.totalHits,
      timeToExpire: Math.max(0, record.expiresAt - now),
      isBlocked: record.blockedUntil > now,
      timeToBlockExpire: Math.max(0, record.blockedUntil - now),
    };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', limit: 2, ttl: 60_000 }],
      storage: new MemoryThrottlerStorage(),
    }),
  ],
  controllers: [ThrottleTestController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ThrottleTestModule {}

test('global and route-specific throttles reject requests over their limits', async () => {
  const app = await NestFactory.create(ThrottleTestModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/throttle-test`;

    assert.equal((await fetch(baseUrl)).status, 200);
    assert.equal((await fetch(baseUrl)).status, 200);
    const globallyLimited = await fetch(baseUrl);
    assert.equal(globallyLimited.status, 429);
    assert.ok(Number(globallyLimited.headers.get('retry-after')) > 0);

    const strictUrl = `${baseUrl}/strict`;
    assert.equal((await fetch(strictUrl)).status, 200);
    assert.equal((await fetch(strictUrl)).status, 429);
  } finally {
    await app.close();
  }
});
