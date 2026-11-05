import { Module } from '@nestjs/common';
import { createClient } from 'redis';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  providers: [
    {
      provide: 'THROTTLER_REDIS_CLIENT',
      useFactory: () => {
        const client = createClient({
          ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),
          socket: {
            connectTimeout: 5_000,
            reconnectStrategy: false,
          },
        });
        client.on('error', () => undefined);
        return client;
      },
    },
    RedisThrottlerStorage,
  ],
  exports: [RedisThrottlerStorage],
})
export class RateLimitStorageModule {}
