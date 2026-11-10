import type { Request } from 'express';

export const USER_AGENT_MAX_LENGTH = 512;

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export function getRequestMetadata(
  request: Pick<Request, 'ip' | 'headers'>,
): RequestMetadata {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: typeof request.ip === 'string' ? request.ip : null,
    userAgent:
      typeof userAgent === 'string'
        ? userAgent.slice(0, USER_AGENT_MAX_LENGTH)
        : null,
  };
}
