import { createApiApplication } from '../../src/main.api';
import { loadApiConfig } from '../../src/common/config/env-config';
import type { EmailSender } from '../../src/modules/auth/email-sender';

export async function bootTestApi(emailSender?: EmailSender) {
  const config = loadApiConfig({
    NODE_ENV: 'test',
    AUTH_SECRET: '11'.repeat(32),
    DATABASE_URL: requiredServiceUrl('DATABASE_URL'),
    REDIS_URL: requiredServiceUrl('REDIS_URL'),
    RABBITMQ_URL: requiredServiceUrl('RABBITMQ_URL'),
    PORT: '3000',
    CORS_ORIGIN: 'http://localhost:3001',
    THROTTLE_AUTH_LIMIT: '1000',
    THROTTLE_OTP_LIMIT: '1000',
  });

  // Infrastructure modules read service URLs from the process environment.
  process.env.DATABASE_URL = config.DATABASE_URL;
  process.env.REDIS_URL = config.REDIS_URL;
  process.env.RABBITMQ_URL = config.RABBITMQ_URL;
  process.env.THROTTLE_AUTH_LIMIT = '1000';
  process.env.THROTTLE_OTP_LIMIT = '1000';
  const app = await createApiApplication(config, emailSender);
  await app.init();
  return app;
}

function requiredServiceUrl(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} must be provided by the test service runner`);
  return name === 'DATABASE_URL'
    ? value.replace(/^postgres:\/\//, 'postgresql://')
    : value;
}
