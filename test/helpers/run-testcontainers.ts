import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import { RedisContainer } from '@testcontainers/redis';
import * as schema from '../../src/db/schema';

const POSTGRES_IMAGE = 'postgres:17.6-alpine';
const REDIS_IMAGE = 'redis:8.2.1-alpine';
const RABBITMQ_IMAGE = 'rabbitmq:4.1.3-management-alpine';

interface StoppableContainer {
  stop(): Promise<unknown>;
}

export async function startTestServices() {
  const started: StoppableContainer[] = [];
  const track = <T extends StoppableContainer>(promise: Promise<T>) =>
    promise.then((container) => {
      started.push(container);
      return container;
    });

  try {
    const databasePassword = randomBytes(24).toString('hex');
    const [postgres, redis, rabbitmq] = await Promise.all([
      track(
        new PostgreSqlContainer(POSTGRES_IMAGE)
          .withDatabase('kova_test')
          .withUsername('kova_test')
          .withPassword(databasePassword)
          .start(),
      ),
      track(new RedisContainer(REDIS_IMAGE).start()),
      track(new RabbitMQContainer(RABBITMQ_IMAGE).start()),
    ]);

    const databaseUrl = postgres.getConnectionUri();
    await applyMigrations(databaseUrl);

    return {
      databaseUrl,
      redisUrl: redis.getConnectionUrl(),
      rabbitMqUrl: rabbitmq.getAmqpUrl(),
      stop: async () => stopAll(started),
    };
  } catch (error) {
    await stopAll(started);
    throw error;
  }
}

async function applyMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 2 });
  try {
    await migrate(drizzle({ client: pool, schema }), {
      migrationsFolder: path.resolve(__dirname, '../../../src/db/migrations'),
    });
  } finally {
    await pool.end();
  }
}

async function stopAll(containers: StoppableContainer[]): Promise<void> {
  const results = await Promise.allSettled(
    containers.reverse().map((container) => container.stop()),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      'One or more Testcontainers services failed to stop',
    );
  }
}

async function run(): Promise<void> {
  const [config, ...jestArgs] = process.argv.slice(2);
  if (!config || !/^jest\.(integration|e2e)\.config\.cjs$/.test(config)) {
    throw new Error(
      'Usage: run-testcontainers jest.integration.config.cjs|jest.e2e.config.cjs [Jest options]',
    );
  }

  const services = await startTestServices();
  try {
    const result = await new Promise<number>((resolve, reject) => {
      const jestCli = path.resolve(
        __dirname,
        '../../../node_modules/jest/bin/jest.js',
      );
      const child = spawn(
        process.execPath,
        [jestCli, '--config', config, '--runInBand', ...jestArgs],
        {
          cwd: path.resolve(__dirname, '../../..'),
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            DATABASE_URL: services.databaseUrl,
            REDIS_URL: services.redisUrl,
            RABBITMQ_URL: services.rabbitMqUrl,
          },
        },
      );
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    process.exitCode = result;
  } finally {
    await services.stop();
  }
}

if (require.main === module) {
  run().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : 'Testcontainers runner failed'}\n`,
    );
    process.exitCode = 1;
  });
}
