import { Module } from '@nestjs/common';
import { AuditDatabase } from './audit.database';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditDatabase, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
