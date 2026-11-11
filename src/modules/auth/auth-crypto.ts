import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { AuthConfig } from '../../common/config/env-config';

export function deriveAuthKey(config: AuthConfig, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      config.secret,
      Buffer.from('kova-auth-v1'),
      Buffer.from(purpose),
      32,
    ),
  );
}

export function keyedHash(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function constantTimeHashEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return (
    leftBytes.length === 32 &&
    rightBytes.length === 32 &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
