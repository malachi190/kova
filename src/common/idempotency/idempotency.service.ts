import { createHash } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

export interface IdempotentResponse {
  status: number;
  body: unknown;
  replayed: boolean;
}

export interface ResponseToStore {
  status: number;
  body: unknown;
}

interface StoredResponse {
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

@Injectable()
export class IdempotencyService implements OnModuleDestroy {
  constructor(@Inject('IDEMPOTENCY_POOL') private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async execute(
    scope: string,
    key: string,
    requestHash: string,
    action: () => Promise<ResponseToStore>,
  ): Promise<IdempotentResponse> {
    const client = await this.pool.connect();
    const advisoryLock = createAdvisoryLock(scope, key);
    let lockAcquired = false;
    let releaseError: Error | undefined;

    try {
      await client.query('SELECT pg_advisory_lock($1::bigint)', [advisoryLock]);
      lockAcquired = true;

      const previousResponse = await this.claimOrLoad(
        client,
        scope,
        key,
        requestHash,
      );
      if (previousResponse) {
        return previousResponse;
      }

      let response: ResponseToStore;
      try {
        response = await action();
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() < 500) {
          await client.query(
            'DELETE FROM idempotency_keys WHERE scope = $1 AND key = $2 AND request_hash = $3',
            [scope, key, requestHash],
          );
        }
        throw error;
      }

      const storedBody = normalizeJsonBody(response.body);
      if (
        !Number.isInteger(response.status) ||
        response.status < 200 ||
        response.status > 599
      ) {
        throw new RangeError('Idempotent response status is invalid');
      }
      await client.query(
        `UPDATE idempotency_keys
         SET response_status = $3, response_body = $4::jsonb
         WHERE scope = $1 AND key = $2 AND request_hash = $5`,
        [scope, key, response.status, JSON.stringify(storedBody), requestHash],
      );

      return { ...response, body: storedBody, replayed: false };
    } catch (error) {
      if (!(error instanceof HttpException)) {
        releaseError =
          error instanceof Error
            ? error
            : new Error('Idempotency database operation failed');
      }
      throw error;
    } finally {
      if (lockAcquired) {
        try {
          await client.query('SELECT pg_advisory_unlock($1::bigint)', [
            advisoryLock,
          ]);
        } catch (error) {
          releaseError =
            error instanceof Error
              ? error
              : new Error('Could not release idempotency lock');
        }
      }
      client.release(releaseError);
    }
  }

  private async claimOrLoad(
    client: PoolClient,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotentResponse | undefined> {
    await client.query('BEGIN');
    let transactionOpen = true;
    try {
      await client.query(
        'DELETE FROM idempotency_keys WHERE scope = $1 AND key = $2 AND expires_at <= now()',
        [scope, key],
      );
      const inserted = await client.query(
        `INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '48 hours')
         ON CONFLICT (scope, key) DO NOTHING
         RETURNING scope`,
        [scope, key, requestHash],
      );
      const result = await client.query<StoredResponse>(
        `SELECT request_hash, response_status, response_body
         FROM idempotency_keys
         WHERE scope = $1 AND key = $2
         FOR UPDATE`,
        [scope, key],
      );
      await client.query('COMMIT');
      transactionOpen = false;

      const stored = result.rows[0];
      if (!stored) {
        throw new Error('Idempotency record was not available after insertion');
      }
      if (stored.request_hash.trim() !== requestHash) {
        throw new ConflictException(
          'Idempotency key was used for a different request',
        );
      }
      if (stored.response_status !== null) {
        return {
          status: stored.response_status,
          body: stored.response_body,
          replayed: true,
        };
      }

      if (inserted.rowCount !== 1) {
        throw new ConflictException('Previous request outcome is unresolved');
      }

      return undefined;
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK');
      throw error;
    }
  }
}

export function hashIdempotentRequest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)) ?? 'null')
    .digest('hex');
}

function createAdvisoryLock(scope: string, key: string): string {
  return createHash('sha256')
    .update(`${scope}\0${key}`)
    .digest()
    .readBigInt64BE(0)
    .toString();
}

function normalizeJsonBody(body: unknown): unknown {
  const encoded = JSON.stringify(body ?? null);
  if (encoded === undefined) {
    throw new TypeError('Idempotent responses must be JSON serializable');
  }
  return JSON.parse(encoded) as unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
