import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  inventory,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  shippingMethods,
} from '../../db/schema/index.ts';

type Db = typeof db | Tx;

// `is_active` lets a method be retired without deleting it (old orders snapshot its name and code).
export async function listActiveShippingMethods(run: Db = db) {
  return run.select().from(shippingMethods).where(eq(shippingMethods.isActive, true));
}

export async function findActiveShippingMethod(code: string, run: Db = db) {
  const [row] = await run
    .select()
    .from(shippingMethods)
    .where(and(eq(shippingMethods.code, code), eq(shippingMethods.isActive, true)));
  return row;
}

// ---------- orders, payments, stock ----------

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

// Takes the row locks on stock in ONE statement, in variant-id order. Two checkouts that touch the
// same two variants then always queue on the lower id first, so neither can hold B while waiting
// for A as the other holds A while waiting for B (the classic deadlock). Postgres applies
// FOR UPDATE after the sort, so the locks are acquired in the ORDER BY order. Every code path
// that changes `inventory.reserved` (place, release, confirm) calls this first.
export async function lockInventory(tx: Tx, variantIds: string[]): Promise<void> {
  if (variantIds.length === 0) return;
  await tx
    .select({ variantId: inventory.variantId })
    .from(inventory)
    .where(inArray(inventory.variantId, variantIds))
    .orderBy(asc(inventory.variantId))
    .for('update');
}

// Holds `qty` units for an order if (and only if) that many are free. The condition lives in the
// UPDATE itself so check and write are one atomic step; the CHECK constraints on `inventory` are a
// third line of defence behind the row lock and this guard.
export async function reserveStock(tx: Tx, variantId: string, qty: number): Promise<boolean> {
  const rows = await tx
    .update(inventory)
    .set({ reserved: sql`${inventory.reserved} + ${qty}` })
    .where(
      and(
        eq(inventory.variantId, variantId),
        sql`${inventory.quantity} - ${inventory.reserved} >= ${qty}`,
      ),
    )
    .returning({ variantId: inventory.variantId });
  return rows.length === 1;
}

export async function releaseStock(tx: Tx, variantId: string, qty: number): Promise<void> {
  await tx
    .update(inventory)
    .set({ reserved: sql`${inventory.reserved} - ${qty}` })
    .where(eq(inventory.variantId, variantId));
}

// Payment confirmed: the held units leave the shelf for good.
export async function commitStock(tx: Tx, variantId: string, qty: number): Promise<void> {
  await tx
    .update(inventory)
    .set({
      quantity: sql`${inventory.quantity} - ${qty}`,
      reserved: sql`${inventory.reserved} - ${qty}`,
    })
    .where(eq(inventory.variantId, variantId));
}

export async function findPendingOrderByCart(
  tx: Tx,
  cartId: string,
): Promise<OrderRow | undefined> {
  const [row] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.cartId, cartId), eq(orders.status, 'pending_payment')))
    .orderBy(desc(orders.createdAt))
    .limit(1)
    .for('update');
  return row;
}

export async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow | undefined> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  return row;
}

export async function findOrderByNumber(
  number: string,
  run: Db = db,
): Promise<OrderRow | undefined> {
  const [row] = await run.select().from(orders).where(eq(orders.number, number));
  return row;
}

export async function listOrderItems(run: Db, orderId: string): Promise<OrderItemRow[]> {
  return run
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
}

export async function insertOrder(tx: Tx, values: typeof orders.$inferInsert): Promise<OrderRow> {
  const [row] = await tx.insert(orders).values(values).returning();
  if (!row) throw new Error('order insert returned no row');
  return row;
}

export async function updateOrder(
  tx: Tx,
  orderId: string,
  values: Partial<typeof orders.$inferInsert>,
): Promise<OrderRow> {
  const [row] = await tx.update(orders).set(values).where(eq(orders.id, orderId)).returning();
  if (!row) throw new Error('order update matched no row');
  return row;
}

export async function replaceOrderItems(
  tx: Tx,
  orderId: string,
  items: Omit<typeof orderItems.$inferInsert, 'orderId'>[],
): Promise<void> {
  await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
  // One statement per line keeps the lines in cart order: a batch shares one created_at and the
  // display order would fall to the random id.
  for (const item of items) await tx.insert(orderItems).values({ ...item, orderId });
}

export async function findPaymentByOrder(
  run: Db,
  orderId: string,
): Promise<PaymentRow | undefined> {
  const [row] = await run.select().from(payments).where(eq(payments.orderId, orderId));
  return row;
}

export async function insertPayment(
  tx: Tx,
  values: typeof payments.$inferInsert,
): Promise<PaymentRow> {
  const [row] = await tx.insert(payments).values(values).returning();
  if (!row) throw new Error('payment insert returned no row');
  return row;
}

export async function updatePayment(
  run: Db,
  paymentId: string,
  values: Partial<typeof payments.$inferInsert>,
): Promise<void> {
  await run.update(payments).set(values).where(eq(payments.id, paymentId));
}

export async function insertHistory(
  tx: Tx,
  values: typeof orderStatusHistory.$inferInsert,
): Promise<void> {
  await tx.insert(orderStatusHistory).values(values);
}
