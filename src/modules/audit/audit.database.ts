import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { loadRuntimeConfig } from '../../common/config/env-config';
import { createDatabase } from '../../db/database';

@Injectable()
export class AuditDatabase implements OnModuleDestroy {
  private connection?: ReturnType<typeof createDatabase>;

  get db() {
    this.connection ??= createDatabase(loadRuntimeConfig().DATABASE_URL);
    return this.connection.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.pool.end();
  }
}
