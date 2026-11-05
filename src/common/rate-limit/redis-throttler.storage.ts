import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { RedisClientType } from 'redis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
local block_ttl = redis.call('PTTL', KEYS[2])
if block_ttl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  local window_ttl = math.max(redis.call('PTTL', KEYS[1]), 0)
  return { hits, window_ttl, 1, block_ttl }
end

local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local window_ttl = math.max(redis.call('PTTL', KEYS[1]), 0)
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, window_ttl, 1, tonumber(ARGV[3]) }
end

return { hits, window_ttl, 0, 0 }
`;

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  constructor(
    @Inject('THROTTLER_REDIS_CLIENT')
    private readonly client: RedisClientType,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) this.client.destroy();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.client.isOpen) await this.client.connect();

    const redisKey = `kova:throttle:{${throttlerName}:${key}}`;
    const reply: unknown = await this.client.eval(INCREMENT_SCRIPT, {
      keys: [redisKey, `${redisKey}:blocked`],
      arguments: [String(ttl), String(limit), String(blockDuration)],
    });
    const values = parseScriptReply(reply);

    return {
      totalHits: values[0],
      timeToExpire: values[1],
      isBlocked: values[2] === 1,
      timeToBlockExpire: values[3],
    };
  }
}

function parseScriptReply(reply: unknown): [number, number, number, number] {
  if (!Array.isArray(reply) || reply.length !== 4) {
    throw new Error('Redis returned an invalid throttling response');
  }

  const values = reply.map(Number);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Redis returned invalid throttling counters');
  }
  return values as [number, number, number, number];
}
