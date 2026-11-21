import { SHORT_DATE_DAYS, addDays } from '@store/shared';
import { sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';

import { todayKey } from './batches.ts';

type Db = typeof db | Tx;

export interface ShortDatedStock {
  /** Packs a shopper can still take at the short-dated price. */
  units: number;
  /** The oldest best-before date among the short-dated packs. */
  bestBefore: string;
}

/**
 * Short-dated availability per variant at one store. COUNTED, not stored (the reservation stays the
 * one number `inventory.reserved`):
 *
 *   units in short-dated batches (best before today .. today + 2)
 *   - short-dated units held by pending orders of that store
 *   capped by what is free at all (quantity - reserved)
 *
 * Call it inside the transaction that reserves, after `lockInventory`: the lock on the stock row is
 * what makes the count safe against a second checkout. `exceptCartId` leaves out the pending order
 * of that cart (a retried payment must not compete with its own earlier attempt).
 * Variants with nothing short-dated are absent from the result.
 */
export async function shortDatedAvailability(
  run: Db,
  storeId: string,
  variantIds: string[],
  opts: { today?: string; exceptCartId?: string } = {},
): Promise<Map<string, ShortDatedStock>> {
  const result = new Map<string, ShortDatedStock>();
  if (variantIds.length === 0) return result;
  const today = opts.today ?? todayKey();
  const last = addDays(today, SHORT_DATE_DAYS);
  const ids = sql.join(
    variantIds.map((v) => sql`${v}::uuid`),
    sql`, `,
  );
  const rows = await run.execute<{
    variant_id: string;
    units: number;
    best_before: string;
    free: number;
  }>(sql`
    select b.variant_id,
      (sum(b.quantity)
        - coalesce((
            select sum(oi.quantity) from order_items oi
            join orders o on o.id = oi.order_id
            where oi.short_dated and oi.variant_id = b.variant_id
              and o.status = 'pending_payment' and o.dark_store_id = ${storeId}::uuid
              ${opts.exceptCartId ? sql`and o.cart_id is distinct from ${opts.exceptCartId}::uuid` : sql``}
          ), 0))::int as units,
      min(b.best_before)::text as best_before,
      greatest(i.quantity - i.reserved, 0)::int as free
    from stock_batches b
    join inventory i on i.store_id = b.store_id and i.variant_id = b.variant_id
    where b.store_id = ${storeId}::uuid and b.variant_id in (${ids}) and b.quantity > 0
      and b.best_before between ${today}::date and ${last}::date
    group by b.variant_id, i.quantity, i.reserved
  `);
  for (const row of rows) {
    const units = Math.min(Number(row.units), Number(row.free));
    if (units > 0) result.set(row.variant_id, { units, bestBefore: row.best_before });
  }
  return result;
}

/**
 * "Best before at least ...": the oldest date of the normal packs (regular class) the store could
 * send; the oldest short-dated date when every pack is short-dated; null when it has no dated pack
 * (non-food, or no stock).
 */
export async function bestBeforeAtLeast(
  run: Db,
  storeId: string,
  variantIds: string[],
  today: string = todayKey(),
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (variantIds.length === 0) return result;
  const first = addDays(today, SHORT_DATE_DAYS + 1);
  const ids = sql.join(
    variantIds.map((v) => sql`${v}::uuid`),
    sql`, `,
  );
  const rows = await run.execute<{ variant_id: string; best_before: string }>(sql`
    select variant_id,
      coalesce(
        min(best_before) filter (where best_before >= ${first}::date),
        min(best_before) filter (where best_before >= ${today}::date)
      )::text as best_before
    from stock_batches
    where store_id = ${storeId}::uuid and variant_id in (${ids}) and quantity > 0
      and best_before is not null
    group by variant_id
  `);
  for (const row of rows) if (row.best_before) result.set(row.variant_id, row.best_before);
  return result;
}

/** Every variant with short-dated packs at the store (for the "Short-dated deals" shelf). */
export async function variantsWithShortDated(
  run: Db,
  storeId: string,
  today: string = todayKey(),
): Promise<string[]> {
  const rows = await run.execute<{ variant_id: string }>(sql`
    select distinct variant_id from stock_batches
    where store_id = ${storeId}::uuid and quantity > 0
      and best_before between ${today}::date and ${addDays(today, SHORT_DATE_DAYS)}::date
  `);
  return rows.map((r) => r.variant_id);
}
