import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { closeDb, db } from './client.ts';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}

// Only run when executed directly (`pnpm db:migrate`), not when imported by the test harness.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMigrations();
  await closeDb();
  console.log('migrations applied');
}
