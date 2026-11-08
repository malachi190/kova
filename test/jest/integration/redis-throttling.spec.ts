import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, it } from '@jest/globals';
import request from 'supertest';
import { RateLimitModule } from '../../../src/common/rate-limit/rate-limit.module';

@Controller('test-throttle')
class ThrottleProbeController {
  @Get()
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  check() {
    return { ok: true };
  }
}

@Module({
  imports: [RateLimitModule],
  controllers: [ThrottleProbeController],
})
class ThrottleProbeModule {}

describe('Redis-backed throttling', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;

  beforeAll(async () => {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');
    app = await NestFactory.create(ThrottleProbeModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects a request after the configured route limit using Redis storage', async () => {
    const server = app.getHttpServer();
    await request(server).get('/test-throttle').expect(200);
    await request(server).get('/test-throttle').expect(429);
  });
});
