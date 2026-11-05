import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Pool } from 'pg';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

@Module({
  providers: [
    {
      provide: 'IDEMPOTENCY_POOL',
      useFactory: () =>
        new Pool({
          ...(process.env.DATABASE_URL
            ? { connectionString: process.env.DATABASE_URL }
            : {}),
          connectionTimeoutMillis: 5_000,
          max: 10,
        }),
    },
    IdempotencyService,
    IdempotencyInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
  ],
})
export class IdempotencyModule {}
