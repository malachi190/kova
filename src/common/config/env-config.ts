import { z } from 'zod';

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

const corsOrigin = z
  .string()
  .url()
  .refine((value) => usesProtocol(value, ['http:', 'https:']), {
    message: 'must use the http:// or https:// scheme',
  })
  .refine(isOriginOnly, {
    message: 'must contain only an origin, with no path, query, or fragment',
  });

const runtimeSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  RABBITMQ_URL: rabbitMqUrl,
});

const apiSchema = runtimeSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65_535),
  CORS_ORIGIN: corsOrigin,
});

export type RuntimeConfig = z.infer<typeof runtimeSchema>;
export type ApiConfig = z.infer<typeof apiSchema>;

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return parseConfig(runtimeSchema, environment);
}

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  return parseConfig(apiSchema, environment);
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

function isOriginOnly(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}
