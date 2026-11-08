import { createApiApplication } from '../../src/main.api';
import { loadApiConfig } from '../../src/common/config/env-config';

export async function bootTestApi() {
  const config = loadApiConfig({
    NODE_ENV: 'test',
    DATABASE_URL: requiredServiceUrl('DATABASE_URL'),
    REDIS_URL: requiredServiceUrl('REDIS_URL'),
    RABBITMQ_URL: requiredServiceUrl('RABBITMQ_URL'),
    PORT: '3000',
    CORS_ORIGIN: 'http://localhost:3001',
  });

  // The rate-limit module reads its Redis URL from the process environment.
  process.env.REDIS_URL = config.REDIS_URL;
  const app = await createApiApplication(config);
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
