import { defineConfig } from 'drizzle-kit';
import { loadRuntimeConfig } from './src/common/config/env-config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: loadRuntimeConfig().DATABASE_URL,
  },
});
