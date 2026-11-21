import { and, eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';

import { db } from '../db/client.ts';
import { inventory, stockBatches } from '../db/schema/index.ts';

/**
 * THE batch invariant: for every stock row, the sum of its batches equals `inventory.quantity`.
 * Call it at the end of a test for every write path (commit, cancel, admin edit, return, expiry job).
 */
export async function expectBatchInvariant(): Promise<void> {
  const rows = await db.execute<{ store_id: string; variant_id: string; q: number; b: number }>(sql`
    select i.store_id, i.variant_id, i.quantity as q, coalesce(sum(s.quantity), 0)::int as b
    from inventory i left join stock_batches s on s.store_id = i.store_id and s.variant_id = i.variant_id
    group by i.store_id, i.variant_id, i.quantity
    having coalesce(sum(s.quantity), 0) <> i.quantity
  `);
  expect([...rows], 'stock rows whose batches do not add up').toEqual([]);
}

/** The batches of one stock row, oldest best-before first (no date last). */
export async function batchesOf(storeId: string, variantId: string) {
  return db
    .select()
    .from(stockBatches)
    .where(and(eq(stockBatches.storeId, storeId), eq(stockBatches.variantId, variantId)))
    .orderBy(sql`${stockBatches.bestBefore} asc nulls last`, stockBatches.receivedAt);
}

/**
 * Sets one shelf to exactly these batches (and the stock row to their sum), for tests that need
 * dated packs: `await setBatches(store, variant, [{ bestBefore: '2026-11-23', quantity: 3 }, ...])`.
 */
export async function setBatches(
  storeId: string,
  variantId: string,
  batches: { bestBefore: string | null; quantity: number }[],
): Promise<void> {
  const total = batches.reduce((n, b) => n + b.quantity, 0);
  await db
    .insert(inventory)
    .values({ storeId, variantId, quantity: total })
    .onConflictDoUpdate({
      target: [inventory.storeId, inventory.variantId],
      set: { quantity: total },
    });
  await db
    .delete(stockBatches)
    .where(and(eq(stockBatches.storeId, storeId), eq(stockBatches.variantId, variantId)));
  const live = batches.filter((b) => b.quantity > 0);
  if (live.length > 0) {
    await db.insert(stockBatches).values(live.map((b) => ({ storeId, variantId, ...b })));
  }
}
