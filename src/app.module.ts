import { Module } from '@nestjs/common';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { HealthModule } from './modules/health/health.module';

@Module({ imports: [HealthModule, IdempotencyModule, RateLimitModule] })
export class AppModule {}
