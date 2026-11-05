import { Module } from '@nestjs/common';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { HealthModule } from './modules/health/health.module';

@Module({ imports: [HealthModule, IdempotencyModule] })
export class AppModule {}
