import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { loadThrottleProfiles } from '../config/env-config';
import { RedisThrottlerGuard } from './redis-throttler.guard';
import { RateLimitStorageModule } from './rate-limit-storage.module';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RateLimitStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: Object.entries(loadThrottleProfiles()).map(
          ([name, profile]) => ({ name, ...profile }),
        ),
        getTracker: (request: Record<string, unknown>) => {
          const ip = request['ip'];
          return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown';
        },
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: RedisThrottlerGuard }],
})
export class RateLimitModule {}
