import { batchClass, compareBestBefore, dateKeyIn, type BatchClass } from '@store/shared';
import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import type { Tx } from '../../db/client.ts';
import {
  inventory,
  inventoryAdjustments,
  orderItemBatches,
  products,
  productVariants,
  stockBatches,
} from '../../db/schema/index.ts';
import * as repo from '../checkout/repo.ts';

// First expired, first out. `inventory.quantity` is what availability reads; the batches say WHICH
// packs those units are. The invariant, asserted by the tests after every write path:
//
//     for every (store, variant): sum(stock_batches.quantity) = inventory.quantity
//
// So every function here that moves one moves the other, in the caller's transaction, and every
// caller has already taken the inventory row lock (`repo.lockInventory`, (store, variant) order).
// Batch rows are never touched without that lock.

export type BatchRow = typeof stockBatches.$inferSelect;

export const todayKey = (now: Date = new Date()): string => dateKeyIn(now);

export interface Allocation {
  batchId: string;
  quantity: number;
}

// Which batches a line prefers, in order of preference (the rest follow as a fallback, because a
// payment that has been taken must never fail for want of the "right" pack):
//   a normal line:      regular packs, then short-dated ones, then (last resort) expired ones;
//   a short-dated line: short-dated packs, then regular, then expired.
// Inside a class: oldest best-before first, no date last, then the older delivery.
const PREFERENCE: Record<'normal' | 'short', BatchClass[]> = {
  normal: ['regular', 'short', 'expired'],
  short: ['short', 'regular', 'expired'],
};

export function orderBatches(
  rows: BatchRow[],
  mode: 'normal' | 'short' | 'oldest',
  today: string,
): BatchRow[] {
  const byAge = (a: BatchRow, b: BatchRow) =>
    compareBestBefore(a.bestBefore, b.bestBefore) ||
    a.receivedAt.getTime() - b.receivedAt.getTime() ||
    a.id.localeCompare(b.id);
  if (mode === 'oldest') return [...rows].sort(byAge);
  const rank = (r: BatchRow) => PREFERENCE[mode].indexOf(batchClass(r.bestBefore, today));
  return [...rows].sort((a, b) => rank(a) - rank(b) || byAge(a, b));
}

async function liveBatches(tx: Tx, storeId: string, variantId: string): Promise<BatchRow[]> {
  return tx
    .select()
    .from(stockBatches)
    .where(
      and(
        eq(stockBatches.storeId, storeId),
        eq(stockBatches.variantId, variantId),
        gt(stockBatches.quantity, 0),
      ),
    )
    .orderBy(asc(stockBatches.id));
}

// Takes `qty` units out of the batches (batches only: the caller moves `inventory`).
async function takeFromBatches(
  tx: Tx,
  storeId: string,
  variantId: string,
  qty: number,
  mode: 'normal' | 'short' | 'oldest',
  today: string,
): Promise<Allocation[]> {
  const ordered = orderBatches(await liveBatches(tx, storeId, variantId), mode, today);
  const taken: Allocation[] = [];
  let left = qty;
  for (const batch of ordered) {
    if (left === 0) break;
    const n = Math.min(left, batch.quantity);
    await tx
      .update(stockBatches)
      .set({ quantity: sql`${stockBatches.quantity} - ${n}` })
      .where(eq(stockBatches.id, batch.id));
    taken.push({ batchId: batch.id, quantity: n });
    left -= n;
  }
  if (left > 0) {
    // The batches do not add up to the stock row: a bug in a write path, never a normal state.
    throw new Error(`batches of ${variantId} at ${storeId} hold ${qty - left}, ${qty} needed`);
  }
  return taken;
}

// Adds units to the batch of that best-before date (created if the store has none), batches only.
export async function addToBatch(
  tx: Tx,
  storeId: string,
  variantId: string,
  qty: number,
  bestBefore: string | null,
): Promise<string> {
  const [existing] = await tx
    .select({ id: stockBatches.id })
    .from(stockBatches)
    .where(
      and(
        eq(stockBatches.storeId, storeId),
        eq(stockBatches.variantId, variantId),
        bestBefore === null
          ? isNull(stockBatches.bestBefore)
          : eq(stockBatches.bestBefore, bestBefore),
      ),
    )
    .orderBy(asc(stockBatches.id))
    .limit(1);
  if (existing) {
    await tx
      .update(stockBatches)
      .set({ quantity: sql`${stockBatches.quantity} + ${qty}` })
      .where(eq(stockBatches.id, existing.id));
    return existing.id;
  }
  const [row] = await tx
    .insert(stockBatches)
    .values({ storeId, variantId, bestBefore, quantity: qty })
    .returning({ id: stockBatches.id });
  if (!row) throw new Error('batch insert returned no row');
  return row.id;
}

type ItemRow = Pick<repo.OrderItemRow, 'id' | 'variantId' | 'quantity' | 'bundleComponents'> & {
  shortDated?: boolean;
  // Substitutions (G7): units the packer found, and whether a replacement was refused. A line short
  // by some units holds only those; a replacement that was rejected holds nothing (see `heldUnits`).
  pickedQty?: number | null;
  swapStatus?: repo.OrderItemRow['swapStatus'];
};

// Units of a line that are still out of the shelf: the packed ones for a short line, none for a
// replacement the shopper rejected (its packs went back when it was rejected).
export function heldUnits(item: Pick<ItemRow, 'quantity' | 'pickedQty' | 'swapStatus'>): number {
  if (item.swapStatus === 'rejected') return 0;
  return item.pickedQty ?? item.quantity;
}

// What one order line holds, per stock variant: the line itself, or the kit's components from the
// checkout snapshot. Not merged across lines: each line records its own packs.
function partsOf(item: ItemRow): { variantId: string; quantity: number }[] {
  if (item.variantId === null) return [];
  const units = heldUnits(item);
  if (units === 0) return [];
  if (!item.bundleComponents) return [{ variantId: item.variantId, quantity: units }];
  return item.bundleComponents.map((c) => ({
    variantId: c.variantId,
    quantity: c.qty * units,
  }));
}

/**
 * Payment confirmed: the held units leave the shelf (`reserved` and `quantity` both drop) and the
 * oldest packs are taken, recorded per line in `order_item_batches`. Caller holds the inventory locks.
 */
export async function commitOrderStock(
  tx: Tx,
  storeId: string,
  items: ItemRow[],
  today: string = todayKey(),
): Promise<void> {
  const totals = new Map<string, number>();
  for (const item of items) {
    for (const part of partsOf(item)) {
      const shortDated = item.shortDated === true;
      const taken = await takeFromBatches(
        tx,
        storeId,
        part.variantId,
        part.quantity,
        shortDated ? 'short' : 'normal',
        today,
      );
      await tx.insert(orderItemBatches).values(
        taken.map((t) => ({
          orderItemId: item.id,
          batchId: t.batchId,
          quantity: t.quantity,
          shortDated,
        })),
      );
      totals.set(part.variantId, (totals.get(part.variantId) ?? 0) + part.quantity);
    }
  }
  for (const [variantId, qty] of totals) await repo.commitStock(tx, storeId, variantId, qty);
}

/**
 * A paid order that never left the building is cancelled or refunded: its packs go back into the
 * SAME batches (from `order_item_batches`). A line with no record (an order paid before batches
 * existed) goes back as a new undated batch, so the invariant holds either way.
 */
export async function restoreOrderStock(tx: Tx, storeId: string, all: ItemRow[]): Promise<void> {
  // A line that holds nothing (a replacement that was rejected) has nothing to give back; its
  // records, if any, stay (a door rejection writes the goods off, like a food return).
  const items = all.filter((i) => heldUnits(i) > 0);
  const ids = items.map((i) => i.id);
  const rows = ids.length
    ? await tx
        .select({
          itemId: orderItemBatches.orderItemId,
          batchId: orderItemBatches.batchId,
          quantity: orderItemBatches.quantity,
          variantId: stockBatches.variantId,
        })
        .from(orderItemBatches)
        .innerJoin(stockBatches, eq(stockBatches.id, orderItemBatches.batchId))
        .where(inArray(orderItemBatches.orderItemId, ids))
    : [];
  const restored = new Map<string, number>();
  for (const row of rows) {
    await tx
      .update(stockBatches)
      .set({ quantity: sql`${stockBatches.quantity} + ${row.quantity}` })
      .where(eq(stockBatches.id, row.batchId));
    restored.set(row.variantId, (restored.get(row.variantId) ?? 0) + row.quantity);
  }
  // Give the records up: the packs are on the shelf again, a second restore must not add them twice.
  if (ids.length)
    await tx.delete(orderItemBatches).where(inArray(orderItemBatches.orderItemId, ids));
  const owed = new Map<string, number>();
  for (const item of items)
    for (const part of partsOf(item))
      owed.set(part.variantId, (owed.get(part.variantId) ?? 0) + part.quantity);
  for (const [variantId, qty] of owed) {
    const missing = qty - (restored.get(variantId) ?? 0);
    if (missing > 0) await addToBatch(tx, storeId, variantId, missing, null);
    await repo.restockUnits(tx, storeId, variantId, qty);
  }
}

/**
 * A line added AFTER payment (a replacement the packer swapped in): its packs leave the shelf now,
 * oldest first, recorded for the line like any other. Returns false, changing nothing, when the
 * store does not have the units free. Caller holds the order lock and the inventory lock.
 */
export async function allocateLineStock(
  tx: Tx,
  storeId: string,
  item: ItemRow,
  today: string = todayKey(),
): Promise<boolean> {
  const parts = partsOf(item);
  if (parts.length !== 1) return false;
  const [part] = parts;
  if (!part) return false;
  const [stock] = await tx
    .select({ quantity: inventory.quantity, reserved: inventory.reserved })
    .from(inventory)
    .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, part.variantId)));
  if (!stock || stock.quantity - stock.reserved < part.quantity) return false;
  const taken = await takeFromBatches(tx, storeId, part.variantId, part.quantity, 'normal', today);
  await tx.insert(orderItemBatches).values(
    taken.map((t) => ({
      orderItemId: item.id,
      batchId: t.batchId,
      quantity: t.quantity,
      shortDated: false,
    })),
  );
  await tx
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} - ${part.quantity}`, updatedAt: sql`now()` })
    .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, part.variantId)));
  return true;
}

/**
 * Units a packer did not find were taken from the books at payment and are simply gone: the line's
 * record of which batches they came from shrinks by that many (latest records first), so cancelling
 * the order later puts back only what was packed. Batches and stock are not touched.
 */
export async function trimLineRecords(tx: Tx, orderItemId: string, units: number): Promise<void> {
  const rows = await tx
    .select()
    .from(orderItemBatches)
    .where(eq(orderItemBatches.orderItemId, orderItemId))
    .orderBy(desc(orderItemBatches.id));
  let left = units;
  for (const row of rows) {
    if (left === 0) break;
    const n = Math.min(left, row.quantity);
    if (n === row.quantity) {
      await tx.delete(orderItemBatches).where(eq(orderItemBatches.id, row.id));
    } else {
      await tx
        .update(orderItemBatches)
        .set({ quantity: row.quantity - n })
        .where(eq(orderItemBatches.id, row.id));
    }
    left -= n;
  }
}

/** New units on the shelf (admin stock increase, a returned household item): a batch plus the stock row. */
export async function receiveStock(
  tx: Tx,
  storeId: string,
  variantId: string,
  qty: number,
  bestBefore: string | null,
): Promise<void> {
  await addToBatch(tx, storeId, variantId, qty, bestBefore);
  await repo.restockUnits(tx, storeId, variantId, qty);
}

/** Units leave without a sale (admin decrease): the oldest packs go first. */
export async function removeOldestStock(
  tx: Tx,
  storeId: string,
  variantId: string,
  qty: number,
  today: string = todayKey(),
): Promise<void> {
  await takeFromBatches(tx, storeId, variantId, qty, 'oldest', today);
  await tx
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} - ${qty}`, updatedAt: sql`now()` })
    .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, variantId)));
}

/** Variants whose product is food (has a shelf life): their returns are written off, not restocked. */
export async function foodVariantIds(tx: Tx, variantIds: string[]): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set();
  const rows = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(inArray(productVariants.id, variantIds), sql`${products.shelfLifeDays} is not null`),
    );
  return new Set(rows.map((r) => r.id));
}

/** Shelf life per variant (null = does not expire), for dating a fresh delivery. */
export async function shelfLifeOf(tx: Tx, variantId: string): Promise<number | null> {
  const [row] = await tx
    .select({ days: products.shelfLifeDays })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId));
  return row?.days ?? null;
}

export interface WriteOffResult {
  batches: number;
  units: number;
  /** Units of expired batches left because pending orders still hold them (written off next run). */
  heldBack: number;
}

/**
 * Expired batches go to 0 and the stock row drops by the same amount, with an `expired` adjustment
 * row. Units reserved by unpaid orders stay (writing them off would leave `reserved` above
 * `quantity`); they go on the run after that order resolves.
 */
export async function writeOffExpired(tx: Tx, now: Date = new Date()): Promise<WriteOffResult> {
  const today = todayKey(now);
  const expired = await tx
    .select()
    .from(stockBatches)
    .where(and(sql`${stockBatches.bestBefore} < ${today}::date`, gt(stockBatches.quantity, 0)))
    .orderBy(asc(stockBatches.storeId), asc(stockBatches.variantId), asc(stockBatches.bestBefore));
  const result: WriteOffResult = { batches: 0, units: 0, heldBack: 0 };
  // Lock per (store, variant) in key order, re-reading the batch under the lock.
  const pairs = [...new Set(expired.map((b) => `${b.storeId}|${b.variantId}`))];
  for (const pair of pairs) {
    const [storeId = '', variantId = ''] = pair.split('|');
    await repo.lockInventory(tx, storeId, [variantId]);
    const [stock] = await tx
      .select({ quantity: inventory.quantity, reserved: inventory.reserved })
      .from(inventory)
      .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, variantId)));
    if (!stock) continue;
    let writable = stock.quantity - stock.reserved;
    let written = 0;
    const fresh = (await liveBatches(tx, storeId, variantId)).filter(
      (b) => batchClass(b.bestBefore, today) === 'expired',
    );
    for (const batch of fresh.sort((a, b) => compareBestBefore(a.bestBefore, b.bestBefore))) {
      const n = Math.min(batch.quantity, Math.max(writable, 0));
      result.heldBack += batch.quantity - n;
      if (n === 0) continue;
      await tx
        .update(stockBatches)
        .set({ quantity: sql`${stockBatches.quantity} - ${n}` })
        .where(eq(stockBatches.id, batch.id));
      writable -= n;
      written += n;
      result.batches += 1;
    }
    if (written > 0) {
      await tx
        .update(inventory)
        .set({ quantity: sql`${inventory.quantity} - ${written}`, updatedAt: sql`now()` })
        .where(and(eq(inventory.storeId, storeId), eq(inventory.variantId, variantId)));
      await tx.insert(inventoryAdjustments).values({
        storeId,
        variantId,
        delta: -written,
        reason: 'expired',
        actor: 'system:job',
        note: `Best before passed (${today})`,
      });
      result.units += written;
    }
  }
  return result;
}
