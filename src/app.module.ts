import { Module } from '@nestjs/common';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [HealthModule, IdempotencyModule, RateLimitModule, AuditModule],
})
export class AppModule {}
