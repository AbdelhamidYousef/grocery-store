import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../client.ts';

import { runSeed } from './index.ts';

async function counts() {
  const rows = await db.execute<Record<string, number>>(sql`
    select
      (select count(*)::int from categories) as categories,
      (select count(*)::int from brands) as brands,
      (select count(*)::int from tags) as tags,
      (select count(*)::int from product_tags) as product_tags,
      (select count(*)::int from collections) as collections,
      (select count(*)::int from collection_products) as collection_products,
      (select count(*)::int from products) as products,
      (select count(*)::int from product_variants) as variants,
      (select count(*)::int from product_images) as images,
      (select count(*)::int from inventory) as inventory,
      (select count(*)::int from users) as users,
      (select count(*)::int from shipping_methods) as shipping`);
  return rows[0];
}

describe('seed', () => {
  it('can run twice without creating duplicates', async () => {
    await runSeed();
    const first = await counts();
    await runSeed();
    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({
      categories: 31,
      products: 40,
      brands: 6,
      tags: 6,
      collections: 5,
      users: 3,
      shipping: 2,
    });
  });

  it('gives every product a brand and links collections and tags', async () => {
    await runSeed();
    const rows = await db.execute<{ unbranded: number; eco: number; empty: number }>(sql`
      select
        (select count(*)::int from products where brand_id is null) as unbranded,
        (select count(*)::int from collection_products cp join collections c on c.id = cp.collection_id where c.slug = 'eco-picks') as eco,
        (select count(*)::int from collections c where not exists (select 1 from collection_products cp where cp.collection_id = c.id)) as empty`);
    expect(rows[0]).toEqual({ unbranded: 0, eco: rows[0]?.eco, empty: 0 });
    expect(rows[0]?.eco).toBeGreaterThan(0);
  });

  it('keeps a seasonal collection live right now and refreshes its window on re-seed', async () => {
    await runSeed(new Date('2026-10-31T12:00:00Z'));
    const [row] = await db.execute<{ starts_at: Date; ends_at: Date }>(
      sql`select starts_at, ends_at from collections where slug = 'halloween'`,
    );
    expect(new Date(String(row?.starts_at)).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(new Date(String(row?.ends_at)).toISOString()).toBe('2026-11-03T00:00:00.000Z');
    // After the season ended the next re-seed moves it to next year.
    await runSeed(new Date('2026-12-01T00:00:00Z'));
    const [next] = await db.execute<{ starts_at: Date }>(
      sql`select starts_at from collections where slug = 'halloween'`,
    );
    expect(new Date(String(next?.starts_at)).toISOString()).toBe('2027-10-01T00:00:00.000Z');
  });

  it('does not reset stock on a second run', async () => {
    await runSeed();
    await db.execute(sql`update inventory set quantity = 777`);
    await runSeed();
    const rows = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from inventory where quantity = 777`,
    );
    expect(rows[0]?.n).toBe(await counts().then((c) => c?.inventory));
  });
});
