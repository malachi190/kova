import { loadApiConfig } from '../../src/common/config/env-config';

export function createTestApiConfig() {
  return loadApiConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/kova_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    RABBITMQ_URL: 'amqp://test:test@127.0.0.1:5672/kova_test',
    PORT: '3000',
    CORS_ORIGIN: 'http://localhost:3001',
  });
}
