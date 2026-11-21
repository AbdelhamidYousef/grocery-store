import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

import { closeDb, db } from '../db/client.ts';
import { seedDelivery } from '../db/seed/delivery.ts';
import { clearBadgeCache } from '../modules/catalog/badge-index.ts';
import { clearDeliveryCache } from '../modules/delivery/areas.ts';
import { clearTopicCache } from '../modules/reviews/service.ts';

import { settlePending } from './pending.ts';

let tables: string[] = [];

beforeAll(async () => {
  // Safety net: truncating is destructive, so check we are really on a *_test database even if
  // someone ran with NODE_ENV=test and no DATABASE_URL_TEST (which would fall back to dev).
  const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  if (!/_test(_[a-z0-9]+)?$/.test(row?.name ?? '')) {
    throw new Error(
      `refusing to truncate "${row?.name}": the test database name must end in _test or _test_<lane>`,
    );
  }
  // Read the table list from the database instead of hard-coding it, so a table added in a later
  // phase is cleaned automatically. The migration journal lives in another schema and is untouched.
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  tables = rows.map((r) => `"${r.tablename}"`);
});

// Every test starts from an empty database. CASCADE follows foreign keys, RESTART IDENTITY resets
// serial counters, and the order-number sequence is not owned by a column so it is reset by hand.
beforeEach(async () => {
  await db.execute(sql.raw(`truncate table ${tables.join(', ')} restart identity cascade`));
  await db.execute(sql`alter sequence order_number_seq restart with 1`);
  // Reference data, not test data: the areas, stores and postcodes are there in every test (fixed ids),
  // as they are in a real database after the migration and seed.
  await seedDelivery(db);
  clearDeliveryCache();
  // The badge index is cached for a minute in production; a new test must not see the last one's.
  clearBadgeCache();
  clearTopicCache();
});

// Before the next test's truncate, not after it: see pending.ts.
afterEach(settlePending);

afterAll(async () => {
  await closeDb();
});
