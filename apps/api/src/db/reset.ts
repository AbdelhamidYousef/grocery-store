import { sql as rawSql } from 'drizzle-orm';

import { env } from '../config/env.ts';

import { closeDb, db } from './client.ts';
import { runMigrations } from './migrate.ts';
import { runSeed } from './seed/index.ts';
import { DEMO_PASSWORD, demoUsers } from './seed/users.ts';

// Two independent guards: this script destroys every table, so it must be impossible to point
// it at a real database by a stray environment variable.
if (env.NODE_ENV === 'production') {
  throw new Error('db:reset refuses to run with NODE_ENV=production');
}
const host = new URL(env.DATABASE_URL).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error(`db:reset refuses to run against a non-local database (${host})`);
}

// Dropping the schemas takes tables, types, sequences and the citext extension with them; the
// "drizzle" schema holds the migration journal, which must go too or migrate would skip everything.
// Silences the long "drop cascades to ..." NOTICE list.
await db.execute(rawSql`SET client_min_messages = warning`);
await db.execute(rawSql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
await db.execute(rawSql`DROP SCHEMA public CASCADE`);
await db.execute(rawSql`CREATE SCHEMA public`);
await runMigrations();
await runSeed();
await closeDb();

console.log('database reset: migrated and seeded');
console.log(`\nDemo logins (password for all: ${DEMO_PASSWORD})`);
for (const u of demoUsers) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
