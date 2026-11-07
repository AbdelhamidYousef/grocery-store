import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

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

// Each run hashes the demo passwords with argon2 and writes ~125 products, ~450 variants and their
// joins; on a busy machine that is several seconds, and a test that times out keeps running into the
// next one's truncate, so the limit is generous rather than tight.
vi.setConfig({ testTimeout: 60_000 });

describe('seed', () => {
  it('can run twice without creating duplicates', async () => {
    await runSeed();
    const first = await counts();
    await runSeed();
    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({
      categories: 31,
      products: 125,
      brands: 6,
      tags: 6,
      collections: 5,
      users: 3,
      shipping: 2,
    });
  });

  it('gives every variant exactly one base price-history row, backdated, even after a re-seed', async () => {
    await runSeed();
    await runSeed();
    const [row] = await db.execute<{
      variants: number;
      without: number;
      rows: number;
      recent: number;
    }>(
      sql`select
        (select count(*)::int from product_variants) as variants,
        (select count(*)::int from product_variants v
          where not exists (select 1 from price_history h where h.variant_id = v.id)) as without,
        (select count(*)::int from price_history where kind = 'base') as rows,
        (select count(*)::int from price_history where valid_from > now() - interval '59 days') as recent`,
    );
    expect(row?.without).toBe(0);
    expect(row?.rows).toBe(row?.variants);
    expect(row?.recent).toBe(0);
  });

  it('gives 6-8 variants a member price about 10% below base, one history row each, idempotently', async () => {
    await runSeed();
    await runSeed();
    const rows = await db.execute<{
      price_cents: number;
      member_price_cents: number;
      is_trial: boolean;
      history: number;
    }>(sql`
      select v.price_cents, v.member_price_cents, v.is_trial,
        (select count(*)::int from price_history h where h.variant_id = v.id and h.kind = 'member') as history
      from product_variants v where v.member_price_cents is not null`);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.length).toBeLessThanOrEqual(8);
    for (const r of rows) {
      expect(r.member_price_cents).toBeGreaterThan(0);
      expect(r.member_price_cents).toBeLessThan(r.price_cents);
      expect(r.member_price_cents).toBe(
        r.price_cents - Math.floor((r.price_cents * 10 + 50) / 100),
      );
      expect(r.is_trial).toBe(false);
      expect(r.history).toBe(1);
    }
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

  it('keeps every trial size well stocked', async () => {
    await runSeed();
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from product_variants v join inventory i on i.variant_id = v.id
      where v.is_trial and i.quantity < 30`);
    expect(rows[0]?.n).toBe(0);
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

describe('seed: product page content', () => {
  it('seeds specs, FAQs, tiling feeding tables, constituents and size guides, once', async () => {
    await runSeed();
    const read = async () =>
      (
        await db.execute<Record<string, number>>(sql`
          select
            (select count(*)::int from product_specs) as specs,
            (select count(*)::int from product_faqs) as faqs,
            (select count(*)::int from feeding_rows) as feeding,
            (select count(*)::int from variant_constituents) as constituents,
            (select count(*)::int from size_guides) as guides,
            (select count(*)::int from products where size_guide_id is not null) as guided,
            (select count(*)::int from products p where
               not exists (select 1 from product_specs s where s.product_id = p.id)) as without_specs`)
      )[0];
    const first = await read();
    await runSeed();
    expect(await read()).toEqual(first);
    expect(first?.without_specs).toBe(0);
    expect(first?.guides).toBe(3);
    expect(first?.guided).toBeGreaterThan(5);
    expect(first?.feeding).toBeGreaterThan(30);
    // Constituents come in sixes (five percentages and kcal) per variant of a fed product.
    expect((first?.constituents ?? 0) % 6).toBe(0);
    expect(first?.constituents).toBeGreaterThan(100);
  });
});
