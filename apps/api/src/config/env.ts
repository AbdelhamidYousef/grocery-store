import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

// The single `.env` lives at the repo root so web, api and tooling share it. dotenv is imported
// only here: everything else receives config through this validated object.
dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Only the test harness needs it; optional so the dev server boots without it.
  DATABASE_URL_TEST: z.url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

// Fail at boot with a readable message instead of at the first request that needs a variable.
export const env = schema.parse(process.env);
