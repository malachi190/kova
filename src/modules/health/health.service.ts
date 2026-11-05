import { Injectable } from '@nestjs/common';
import { connect as connectAmqp } from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import { Client } from 'pg';
import { createClient } from 'redis';

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'error';
  dependencies: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    rabbitmq: DependencyStatus;
  };
}

@Injectable()
export class HealthService {
  async check(): Promise<HealthReport> {
    const [postgres, redis, rabbitmq] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkRabbitMq(),
    ]);
    const dependencies = { postgres, redis, rabbitmq };
    const status = Object.values(dependencies).every((state) => state === 'up')
      ? 'ok'
      : 'error';

    return { status, dependencies };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return 'down';

    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 1_000,
      query_timeout: 1_000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const url = process.env.REDIS_URL;
    if (!url) return 'down';

    const client = createClient({
      url,
      socket: {
        connectTimeout: 1_000,
        reconnectStrategy: false,
      },
    });
    client.on('error', () => undefined);

    try {
      await client.connect();
      await client.ping();
      return 'up';
    } catch {
      return 'down';
    } finally {
      if (client.isOpen) client.destroy();
    }
  }

  private async checkRabbitMq(): Promise<DependencyStatus> {
    const url = process.env.RABBITMQ_URL;
    if (!url) return 'down';

    let connection: ChannelModel | undefined;
    let channel: Channel | undefined;
    try {
      connection = await connectAmqp(url, { timeout: 1_000 });
      channel = await connection.createChannel();
      return 'up';
    } catch {
      return 'down';
    } finally {
      await channel?.close().catch(() => undefined);
      await connection?.close().catch(() => undefined);
    }
  }
}
