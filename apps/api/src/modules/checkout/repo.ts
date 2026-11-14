import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import {
  bundleItems,
  inventory,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  shippingMethods,
  webhookEvents,
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

// ---------- bundles ----------

export interface StockLine {
  variantId: string;
  quantity: number;
}

export interface BundleComponent {
  variantId: string;
  qty: number;
}

// The kits among `variantIds`, with their CURRENT parts. Used at checkout (to snapshot onto the
// order) and for the live cart; an order that already exists never calls this, it uses its snapshot.
export async function bundleComponentsOf(
  run: Db,
  variantIds: string[],
): Promise<Map<string, BundleComponent[]>> {
  const byBundle = new Map<string, BundleComponent[]>();
  if (variantIds.length === 0) return byBundle;
  const parts = await run
    .select()
    .from(bundleItems)
    .where(inArray(bundleItems.bundleVariantId, variantIds));
  for (const p of parts) {
    const list = byBundle.get(p.bundleVariantId) ?? [];
    list.push({ variantId: p.componentVariantId, qty: p.qty });
    byBundle.set(p.bundleVariantId, list);
  }
  return byBundle;
}

// A kit holds no stock of its own: selling one reserves, commits, releases and restocks its
// COMPONENTS. This is the single expansion every stock path goes through (checkout, release,
// payment, cancel/refund; later pickup and returns reuse it). Lines of the same variant are
// merged, so a component that is also in the cart on its own is touched once. Kits cannot nest
// (admin validation), so one level is enough.
// `components` decides what a kit is made of: the live parts for a cart (see `bundleComponentsOf`)
// or, for a line of an existing order, the snapshot taken at checkout (`bundleComponents`).
export function expandLines(
  lines: (StockLine & { components?: BundleComponent[] | null })[],
): StockLine[] {
  const merged = new Map<string, number>();
  const add = (variantId: string, quantity: number) =>
    merged.set(variantId, (merged.get(variantId) ?? 0) + quantity);
  for (const line of lines) {
    if (!line.components) add(line.variantId, line.quantity);
    else for (const c of line.components) add(c.variantId, c.qty * line.quantity);
  }
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

// Live expansion (cart lines about to be reserved).
export async function expandBundles(run: Db, lines: StockLine[]): Promise<StockLine[]> {
  const byBundle = await bundleComponentsOf(
    run,
    lines.map((l) => l.variantId),
  );
  return expandLines(lines.map((l) => ({ ...l, components: byBundle.get(l.variantId) })));
}

// Stock lines an existing order holds, from its snapshot. A deleted variant has no inventory row.
export function expandOrderItems(
  items: Pick<OrderItemRow, 'variantId' | 'quantity' | 'bundleComponents'>[],
): StockLine[] {
  return expandLines(
    items.flatMap((i) =>
      i.variantId === null
        ? []
        : [{ variantId: i.variantId, quantity: i.quantity, components: i.bundleComponents }],
    ),
  );
}

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

// Cancel/refund of an order that was paid but not shipped: the units go back on the shelf.
export async function restockUnits(tx: Tx, variantId: string, qty: number): Promise<void> {
  await tx
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} + ${qty}` })
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

export async function findOrderById(run: Db, orderId: string): Promise<OrderRow | undefined> {
  const [row] = await run.select().from(orders).where(eq(orders.id, orderId));
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

// The payment that belongs to a Stripe intent id, or undefined for an intent we never created.
export async function findPaymentByIntent(
  run: Db,
  intentId: string,
): Promise<PaymentRow | undefined> {
  const [row] = await run
    .select()
    .from(payments)
    .where(eq(payments.providerPaymentIntentId, intentId));
  return row;
}

export async function lockPayment(tx: Tx, paymentId: string): Promise<PaymentRow | undefined> {
  const [row] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
  return row;
}

// ---------- webhook events ----------

export type WebhookEventRow = typeof webhookEvents.$inferSelect;

// `ON CONFLICT DO NOTHING`: the Stripe event id is the primary key, so a second delivery of the
// same event inserts nothing. (If a concurrent first delivery has not committed yet, this
// statement waits for it, which is exactly the serialisation we want.)
export async function insertWebhookEvent(
  tx: Tx,
  values: typeof webhookEvents.$inferInsert,
): Promise<void> {
  await tx.insert(webhookEvents).values(values).onConflictDoNothing();
}

export async function lockWebhookEvent(tx: Tx, eventId: string): Promise<WebhookEventRow> {
  const [row] = await tx
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, eventId))
    .for('update');
  if (!row) throw new Error(`webhook event ${eventId} vanished after insert`);
  return row;
}

export async function markWebhookEventProcessed(tx: Tx, eventId: string): Promise<void> {
  await tx
    .update(webhookEvents)
    .set({ processedAt: new Date(), error: null })
    .where(eq(webhookEvents.id, eventId));
}

// Written outside the failed transaction (which rolled back along with the event row), so the
// failure is visible for debugging while `processed_at` stays null and Stripe's retry reprocesses.
export async function recordWebhookFailure(
  values: typeof webhookEvents.$inferInsert & { error: string },
): Promise<void> {
  await db
    .insert(webhookEvents)
    .values(values)
    .onConflictDoUpdate({ target: webhookEvents.id, set: { error: values.error } });
}
