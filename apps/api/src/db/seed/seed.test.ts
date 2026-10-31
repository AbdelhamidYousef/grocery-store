import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, db } from '../client.ts';
import { runMigrations } from '../migrate.ts';

import { runSeed } from './index.ts';

async function counts() {
  const rows = await db.execute<Record<string, number>>(sql`
    select
      (select count(*)::int from categories) as categories,
      (select count(*)::int from products) as products,
      (select count(*)::int from product_variants) as variants,
      (select count(*)::int from product_images) as images,
      (select count(*)::int from inventory) as inventory,
      (select count(*)::int from users) as users,
      (select count(*)::int from shipping_methods) as shipping`);
  return rows[0];
}

// Leaves the (test-only) database empty again so other test files see no seeded products.
const wipe = () =>
  db.execute(sql`truncate categories, users, shipping_methods, products restart identity cascade`);

describe('seed', () => {
  beforeAll(async () => {
    await runMigrations();
    await wipe();
  });
  afterAll(async () => {
    await wipe();
    await closeDb();
  });

  it('can run twice without creating duplicates', async () => {
    await runSeed();
    const first = await counts();
    await runSeed();
    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({ categories: 25, products: 40, users: 3, shipping: 2 });
  });

  it('does not reset stock on a second run', async () => {
    await db.execute(sql`update inventory set quantity = 777`);
    await runSeed();
    const rows = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from inventory where quantity = 777`,
    );
    expect(rows[0]?.n).toBe(await counts().then((c) => c?.inventory));
  });
});
