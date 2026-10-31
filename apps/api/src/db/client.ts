import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../config/env.ts';

import * as schema from './schema/index.ts';

// Tests point DATABASE_URL_TEST at a separate database so truncating tables can never touch dev data.
const url =
  env.NODE_ENV === 'test' && env.DATABASE_URL_TEST ? env.DATABASE_URL_TEST : env.DATABASE_URL;

// One pool per process. `max` stays below the free-tier connection limits of Neon; idle
// connections are released so a sleeping free-tier database is not kept awake by the pool.
export const sql = postgres(url, { max: 10, idle_timeout: 20 });

export const db = drizzle(sql, { schema });

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
