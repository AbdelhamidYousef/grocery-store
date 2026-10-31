import { defineConfig } from 'drizzle-kit';

import { env } from './src/config/env.ts';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  // Migrations are the source of truth for every environment, including prod. They are read
  // before they are applied, and committed.
  out: './src/db/migrations',
  dbCredentials: { url: env.DATABASE_URL },
});
