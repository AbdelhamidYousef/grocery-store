import { and, asc, count, desc, eq, inArray, isNotNull, max, ne, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  inventoryAdjustments,
  orderItems,
  orderStatusHistory,
  orders,
  returnItems,
  returns,
} from '../../db/schema/index.ts';

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

// ---------- admin ----------

export async function lockReturn(tx: Tx, returnId: string): Promise<ReturnRow | undefined> {
  const [row] = await tx.select().from(returns).where(eq(returns.id, returnId)).for('update');
  return row;
}

export async function findReturn(run: Db, returnId: string): Promise<ReturnRow | undefined> {
  const [row] = await run.select().from(returns).where(eq(returns.id, returnId));
  return row;
}

export async function updateReturn(
  tx: Tx,
  returnId: string,
  values: Partial<typeof returns.$inferInsert>,
): Promise<ReturnRow> {
  const [row] = await tx.update(returns).set(values).where(eq(returns.id, returnId)).returning();
  if (!row) throw new Error('return update matched no row');
  return row;
}

export async function listAdmin(opts: {
  status?: ReturnRow['status'] | undefined;
  page: number;
  limit: number;
}) {
  const where = opts.status ? eq(returns.status, opts.status) : undefined;
  const units = db
    .select({
      returnId: returnItems.returnId,
      units: sql<number>`sum(${returnItems.quantity})::int`.as('units'),
    })
    .from(returnItems)
    .groupBy(returnItems.returnId)
    .as('units');
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: returns.id,
        orderNumber: orders.number,
        email: orders.email,
        currency: orders.currency,
        status: returns.status,
        reason: returns.reason,
        refundCents: returns.refundCents,
        itemCount: units.units,
        createdAt: returns.createdAt,
      })
      .from(returns)
      .innerJoin(orders, eq(orders.id, returns.orderId))
      .leftJoin(units, eq(units.returnId, returns.id))
      .where(where)
      .orderBy(desc(returns.createdAt), desc(returns.id))
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db.select({ n: count() }).from(returns).where(where),
  ]);
  return { rows, total: totals[0]?.n ?? 0 };
}

// Has another return of this order already been promised the shipping money?
export async function shippingRefundedElsewhere(
  run: Db,
  orderId: string,
  exceptReturnId: string,
): Promise<boolean> {
  const [row] = await run
    .select({ n: count() })
    .from(returns)
    .where(
      and(
        eq(returns.orderId, orderId),
        eq(returns.refundShipping, true),
        isNotNull(returns.refundIntentAt),
        ne(returns.id, exceptReturnId),
      ),
    );
  return (row?.n ?? 0) > 0;
}

// Units per order line that are in a REFUNDED return: when every paid line is back in full the
// order itself becomes refunded.
export async function refundedQuantities(run: Db, orderId: string): Promise<Map<string, number>> {
  const rows = await run
    .select({
      orderItemId: returnItems.orderItemId,
      qty: sql<number>`sum(${returnItems.quantity})::int`,
    })
    .from(returnItems)
    .innerJoin(returns, eq(returns.id, returnItems.returnId))
    .where(and(eq(returns.orderId, orderId), eq(returns.status, 'refunded')))
    .groupBy(returnItems.orderItemId);
  return new Map(rows.map((r) => [r.orderItemId, Number(r.qty)]));
}

export async function insertAdjustment(
  tx: Tx,
  values: typeof inventoryAdjustments.$inferInsert,
): Promise<void> {
  await tx.insert(inventoryAdjustments).values(values);
}
