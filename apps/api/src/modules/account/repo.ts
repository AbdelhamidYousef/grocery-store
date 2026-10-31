import { and, asc, count, desc, eq, inArray, ne } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { addresses, orderItems, orderStatusHistory, orders, users } from '../../db/schema/index.ts';

export type AddressRow = typeof addresses.$inferSelect;
type AddressValues = Omit<typeof addresses.$inferInsert, 'id' | 'userId'>;

export async function updateUserNames(
  userId: string,
  names: { firstName?: string | undefined; lastName?: string | undefined },
) {
  const [row] = await db.update(users).set(names).where(eq(users.id, userId)).returning();
  return row;
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ---------- addresses ----------

// Every address query below filters by BOTH the address id and the owner. The id alone comes from
// the URL and is attacker-controlled; the owner comes from the session. A row that exists but
// belongs to someone else is indistinguishable from a row that does not exist (no IDOR).

export async function listAddresses(userId: string): Promise<AddressRow[]> {
  return (
    db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      // Defaults first so the checkout can take the first row; then newest.
      .orderBy(
        desc(addresses.isDefaultShipping),
        desc(addresses.isDefaultBilling),
        desc(addresses.createdAt),
      )
  );
}

// Serialises every address write of one user. The "one default per kind" rule is a partial unique
// index, so two concurrent "make me default" requests could otherwise collide on it (a 500);
// with the user row locked, they queue instead.
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
}

export async function countAddresses(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(addresses).where(eq(addresses.userId, userId));
  return row?.n ?? 0;
}

export async function clearDefault(
  tx: Tx,
  userId: string,
  kind: 'shipping' | 'billing',
  exceptId?: string,
): Promise<void> {
  const column = kind === 'shipping' ? addresses.isDefaultShipping : addresses.isDefaultBilling;
  const flag = kind === 'shipping' ? { isDefaultShipping: false } : { isDefaultBilling: false };
  await tx
    .update(addresses)
    .set(flag)
    .where(
      and(
        eq(addresses.userId, userId),
        eq(column, true),
        exceptId ? ne(addresses.id, exceptId) : undefined,
      ),
    );
}

export async function insertAddress(
  tx: Tx,
  userId: string,
  values: AddressValues,
): Promise<AddressRow> {
  const [row] = await tx
    .insert(addresses)
    .values({ ...values, userId })
    .returning();
  if (!row) throw new Error('address insert returned no row');
  return row;
}

export async function updateAddress(
  tx: Tx,
  userId: string,
  id: string,
  values: Partial<AddressValues>,
): Promise<AddressRow | undefined> {
  const [row] = await tx
    .update(addresses)
    .set(values)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .returning();
  return row;
}

export async function deleteAddress(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .returning({ id: addresses.id });
  return rows.length > 0;
}

// ---------- orders ----------

export async function listOrders(userId: string, page: number, limit: number) {
  // A `pending_payment` order is an abandoned or in-flight checkout, not something the customer
  // bought, so it stays out of their history.
  const where = and(eq(orders.userId, userId), ne(orders.status, 'pending_payment'));
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ n: count() }).from(orders).where(where),
  ]);
  return { rows, total: totals[0]?.n ?? 0 };
}

// Items of several orders in one query (the list shows counts and thumbnails; N queries would be
// the classic N+1). Lines keep their display order.
export async function listItemsForOrders(orderIds: string[]) {
  if (orderIds.length === 0) return [];
  return db
    .select({
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      imageUrl: orderItems.imageUrl,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.createdAt), asc(orderItems.id));
}

// The owner goes into the WHERE clause, not into a check after the fetch: someone else's order is
// then indistinguishable from a missing one (404 for both), so numbers cannot be probed.
export async function findOwnOrder(userId: string, number: string) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.number, number), eq(orders.userId, userId)));
  return row;
}

export async function listStatusHistory(orderId: string) {
  return db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id));
}
