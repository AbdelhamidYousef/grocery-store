import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { orderItems, orderStatusHistory, returnItems, returns } from '../../db/schema/index.ts';

import { COUNTING_RETURN_STATUSES } from './state-machine.ts';

type Db = typeof db | Tx;

export type ReturnRow = typeof returns.$inferSelect;
export type ReturnItemRow = typeof returnItems.$inferSelect;

// A return item together with the order line it came from (names and image for display, and the
// variant and kit snapshot the restock reads).
export interface ReturnItemWithLine extends ReturnItemRow {
  productName: string;
  variantName: string;
  imageUrl: string | null;
  variantId: string | null;
  bundleComponents: { variantId: string; qty: number }[] | null;
}

// When the order reached `delivered`: the last such history row (an order cannot be delivered
// twice, but "latest" is the safe reading if a row is ever repeated). Null if it never was.
export async function deliveredAt(run: Db, orderId: string): Promise<Date | null> {
  const [row] = await run
    .select({ at: max(orderStatusHistory.createdAt) })
    .from(orderStatusHistory)
    .where(
      and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.toStatus, 'delivered')),
    );
  return row?.at ?? null;
}

// Units already claimed per order line by returns that are not rejected.
export async function countedQuantities(run: Db, orderId: string): Promise<Map<string, number>> {
  const rows = await run
    .select({
      orderItemId: returnItems.orderItemId,
      qty: sql<number>`sum(${returnItems.quantity})::int`,
    })
    .from(returnItems)
    .innerJoin(returns, eq(returns.id, returnItems.returnId))
    .where(
      and(eq(returns.orderId, orderId), inArray(returns.status, [...COUNTING_RETURN_STATUSES])),
    )
    .groupBy(returnItems.orderItemId);
  return new Map(rows.map((r) => [r.orderItemId, Number(r.qty)]));
}

export async function insertReturn(
  tx: Tx,
  values: typeof returns.$inferInsert,
  items: Omit<typeof returnItems.$inferInsert, 'returnId'>[],
): Promise<ReturnRow> {
  const [row] = await tx.insert(returns).values(values).returning();
  if (!row) throw new Error('return insert returned no row');
  await tx.insert(returnItems).values(items.map((i) => ({ ...i, returnId: row.id })));
  return row;
}

export async function listItems(run: Db, returnIds: string[]): Promise<ReturnItemWithLine[]> {
  if (returnIds.length === 0) return [];
  return run
    .select({
      id: returnItems.id,
      returnId: returnItems.returnId,
      orderItemId: returnItems.orderItemId,
      quantity: returnItems.quantity,
      reason: returnItems.reason,
      refundCents: returnItems.refundCents,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      imageUrl: orderItems.imageUrl,
      variantId: orderItems.variantId,
      bundleComponents: orderItems.bundleComponents,
    })
    .from(returnItems)
    .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
    .where(inArray(returnItems.returnId, returnIds))
    .orderBy(asc(orderItems.createdAt), asc(returnItems.id));
}

export async function listByOrder(run: Db, orderId: string): Promise<ReturnRow[]> {
  return run
    .select()
    .from(returns)
    .where(eq(returns.orderId, orderId))
    .orderBy(desc(returns.createdAt), desc(returns.id));
}
