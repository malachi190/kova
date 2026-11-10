import { z } from 'zod';
import { isIP } from 'node:net';
import {
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
  REQUEST_BODY_LIMIT_BYTES,
} from '../security/security-defaults';

const postgresUrl = z
  .string()
  .url()
  .refine((value) => usesProtocol(value, ['postgresql:']), {
    message: 'must use the postgresql:// scheme',
  });

const redisUrl = z
  .string()
  .url()
  .refine((value) => usesProtocol(value, ['redis:', 'rediss:']), {
    message: 'must use the redis:// or rediss:// scheme',
  });

const rabbitMqUrl = z
  .string()
  .url()
  .refine((value) => usesProtocol(value, ['amqp:', 'amqps:']), {
    message: 'must use the amqp:// or amqps:// scheme',
  });

const corsOrigins = z.string().refine(isAllowedOriginList, {
  message: 'must be a comma-separated list of exact http(s) origins',
});

const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().min(1).max(maximum).default(fallback);

const throttleEnvironmentSchema = z.object({
  THROTTLE_DEFAULT_LIMIT: positiveInteger(DEFAULT_THROTTLE_LIMIT, 1_000_000),
  THROTTLE_DEFAULT_TTL_MS: positiveInteger(DEFAULT_THROTTLE_TTL_MS, 86_400_000),
  THROTTLE_AUTH_LIMIT: positiveInteger(5, 1_000_000),
  THROTTLE_AUTH_TTL_MS: positiveInteger(60_000, 86_400_000),
  THROTTLE_OTP_LIMIT: positiveInteger(3, 1_000_000),
  THROTTLE_OTP_TTL_MS: positiveInteger(300_000, 86_400_000),
  THROTTLE_PAYMENT_LIMIT: positiveInteger(10, 1_000_000),
  THROTTLE_PAYMENT_TTL_MS: positiveInteger(60_000, 86_400_000),
  THROTTLE_DISPUTE_LIMIT: positiveInteger(3, 1_000_000),
  THROTTLE_DISPUTE_TTL_MS: positiveInteger(60_000, 86_400_000),
});

const runtimeSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  RABBITMQ_URL: rabbitMqUrl,
});

const apiSchema = runtimeSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65_535),
  CORS_ORIGIN: corsOrigins,
  TRUST_PROXY: z.string().optional(),
  BODY_LIMIT_BYTES: positiveInteger(
    REQUEST_BODY_LIMIT_BYTES,
    100 * 1024 * 1024,
  ),
  BODY_LIMIT_OVERRIDES: z.string().default(''),
  ...throttleEnvironmentSchema.shape,
});

export type RuntimeConfig = z.infer<typeof runtimeSchema>;
export type TrustProxySetting = false | number | string[];
export interface BodyLimitOverride {
  prefix: string;
  bytes: number;
}
export type ThrottleProfileName =
  'default' | 'auth' | 'otp' | 'payment' | 'dispute';
export type ThrottleProfiles = Record<
  ThrottleProfileName,
  { limit: number; ttl: number }
>;
export type ApiConfig = z.infer<typeof apiSchema> & {
  corsOrigins: string[];
  trustProxy: TrustProxySetting;
  bodyLimitOverrides: BodyLimitOverride[];
  throttleProfiles: ThrottleProfiles;
};

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return parseConfig(runtimeSchema, environment);
}

export function loadThrottleProfiles(
  environment: NodeJS.ProcessEnv = process.env,
): ThrottleProfiles {
  return toThrottleProfiles(
    parseConfig(throttleEnvironmentSchema, environment),
  );
}

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const config = parseConfig(apiSchema, environment);
  let trustProxy: TrustProxySetting;
  let bodyLimitOverrides: BodyLimitOverride[];
  try {
    trustProxy = parseTrustProxySetting(config.TRUST_PROXY);
    bodyLimitOverrides = parseBodyLimitOverrides(config.BODY_LIMIT_OVERRIDES);
  } catch (error) {
    const field =
      error instanceof TrustProxyConfigError
        ? 'TRUST_PROXY'
        : 'BODY_LIMIT_OVERRIDES';
    throw new Error(
      `Invalid environment configuration: ${field}: invalid value`,
    );
  }

  return {
    ...config,
    corsOrigins: [
      ...new Set(
        config.CORS_ORIGIN.split(',').map(
          (origin) => new URL(origin.trim()).origin,
        ),
      ),
    ],
    trustProxy,
    bodyLimitOverrides,
    throttleProfiles: toThrottleProfiles(config),
  };
}

export function parseTrustProxySetting(value?: string): TrustProxySetting {
  if (value === undefined) return false;
  const setting = value.trim();
  if (setting === 'false') return false;
  if (!setting || setting.toLowerCase() === 'true') {
    throw new TrustProxyConfigError();
  }

  if (/^\d+$/.test(setting)) {
    const hops = Number(setting);
    if (Number.isSafeInteger(hops) && hops <= 10) return hops;
    throw new TrustProxyConfigError();
  }

  const parts = setting.split(',').map((part) => part.trim().toLowerCase());
  if (
    parts.some(
      (part) =>
        !part ||
        (!['loopback', 'linklocal', 'uniquelocal'].includes(part) &&
          !isValidIpOrCidr(part)),
    )
  ) {
    throw new TrustProxyConfigError();
  }
  return parts;
}

export function parseBodyLimitOverrides(value: string): BodyLimitOverride[] {
  if (!value.trim()) return [];
  const overrides = value.split(',').map((entry) => {
    const separator = entry.lastIndexOf('=');
    if (separator < 1) throw new Error('Invalid body limit override');
    const prefix = entry.slice(0, separator).trim();
    const bytesText = entry.slice(separator + 1).trim();
    const bytes = Number(bytesText);
    if (
      !prefix.startsWith('/') ||
      prefix.includes('?') ||
      prefix.includes('#') ||
      !/^\d+$/.test(bytesText) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > 100 * 1024 * 1024
    ) {
      throw new Error('Invalid body limit override');
    }
    return { prefix: prefix.replace(/\/$/, '') || '/', bytes };
  });
  const prefixes = overrides.map(({ prefix }) => prefix);
  if (new Set(prefixes).size !== prefixes.length) {
    throw new Error('Duplicate body limit prefix');
  }
  return overrides;
}

function parseConfig<T extends z.ZodType>(
  schema: T,
  environment: NodeJS.ProcessEnv,
): z.infer<T> {
  const result = schema.safeParse(environment);
  if (result.success) return result.data;

  const issues = result.error.issues
    .map(
      (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
    )
    .join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

function isAllowedOriginList(value: string): boolean {
  const origins = value.split(',').map((origin) => origin.trim());
  return origins.length > 0 && origins.every(isExactOrigin);
}

function usesProtocol(
  value: string,
  allowedProtocols: readonly string[],
): boolean {
  try {
    return allowedProtocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isExactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value !== '*' &&
      ['http:', 'https:'].includes(url.protocol) &&
      isOriginOnly(value) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isOriginOnly(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isValidIpOrCidr(value: string): boolean {
  const separator = value.lastIndexOf('/');
  const address = separator < 0 ? value : value.slice(0, separator);
  const version = isIP(address);
  if (version === 0) return false;
  if (separator < 0) return true;
  const bitsText = value.slice(separator + 1);
  if (!/^\d+$/.test(bitsText)) return false;
  const bits = Number(bitsText);
  return bits <= (version === 4 ? 32 : 128);
}

class TrustProxyConfigError extends Error {}

function toThrottleProfiles(
  config: z.infer<typeof throttleEnvironmentSchema>,
): ThrottleProfiles {
  return {
    default: {
      limit: config.THROTTLE_DEFAULT_LIMIT,
      ttl: config.THROTTLE_DEFAULT_TTL_MS,
    },
    auth: {
      limit: config.THROTTLE_AUTH_LIMIT,
      ttl: config.THROTTLE_AUTH_TTL_MS,
    },
    otp: { limit: config.THROTTLE_OTP_LIMIT, ttl: config.THROTTLE_OTP_TTL_MS },
    payment: {
      limit: config.THROTTLE_PAYMENT_LIMIT,
      ttl: config.THROTTLE_PAYMENT_TTL_MS,
    },
    dispute: {
      limit: config.THROTTLE_DISPUTE_LIMIT,
      ttl: config.THROTTLE_DISPUTE_TTL_MS,
    },
  };
}
