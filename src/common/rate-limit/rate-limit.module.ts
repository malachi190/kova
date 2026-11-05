import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
} from '../security/security-defaults';
import { RateLimitStorageModule } from './rate-limit-storage.module';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RateLimitStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            limit: DEFAULT_THROTTLE_LIMIT,
            ttl: DEFAULT_THROTTLE_TTL_MS,
          },
        ],
        getTracker: (request: Record<string, unknown>) => {
          const ip = request['ip'];
          return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown';
        },
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
