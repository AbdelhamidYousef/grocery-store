import { and, desc, eq, sql } from 'drizzle-orm';

import type { db, Tx } from '../../db/client.ts';
import { orders, pointsLedger, users } from '../../db/schema/index.ts';

type Run = typeof db | Tx;

export interface Standing {
  balance: number;
  /** Earn + bonus rows, minus earn claw-backs (negative reversal rows). Drives the tier. */
  lifetimeEarned: number;
}

// One aggregate, two numbers. A negative `reversal` is an earn that was taken back, so it lowers
// lifetime; a positive `reversal` is redeemed points given back, which was never earned.
export async function standing(run: Run, userId: string): Promise<Standing> {
  const [row] = await run
    .select({
      balance: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int`,
      lifetime: sql<number>`coalesce(sum(${pointsLedger.delta}) filter (where ${pointsLedger.kind} in ('earn', 'bonus') or (${pointsLedger.kind} = 'reversal' and ${pointsLedger.delta} < 0)), 0)::int`,
    })
    .from(pointsLedger)
    .where(eq(pointsLedger.userId, userId));
  return { balance: row?.balance ?? 0, lifetimeEarned: Math.max(0, row?.lifetime ?? 0) };
}

export interface LedgerInsert {
  userId: string;
  delta: number;
  kind: (typeof pointsLedger.$inferInsert)['kind'];
  orderId?: string | null;
  refKey: string;
  reason?: string | null;
}

/** Inserts one row; returns false when the idempotency key already exists (nothing written). */
export async function insertEntry(run: Run, row: LedgerInsert): Promise<boolean> {
  const inserted = await run
    .insert(pointsLedger)
    .values({ ...row, orderId: row.orderId ?? null, reason: row.reason ?? null })
    .onConflictDoNothing({ target: pointsLedger.refKey })
    .returning({ id: pointsLedger.id });
  return inserted.length > 0;
}

export async function recentEntries(run: Run, userId: string, limit: number) {
  return run
    .select({
      id: pointsLedger.id,
      delta: pointsLedger.delta,
      kind: pointsLedger.kind,
      reason: pointsLedger.reason,
      createdAt: pointsLedger.createdAt,
      orderNumber: orders.number,
    })
    .from(pointsLedger)
    .leftJoin(orders, eq(orders.id, pointsLedger.orderId))
    .where(eq(pointsLedger.userId, userId))
    .orderBy(desc(pointsLedger.createdAt), desc(pointsLedger.id))
    .limit(limit);
}

export async function entriesForOrder(run: Run, orderId: string) {
  return run.select().from(pointsLedger).where(eq(pointsLedger.orderId, orderId));
}

export async function findEntry(run: Run, userId: string, refKey: string) {
  const [row] = await run
    .select()
    .from(pointsLedger)
    .where(and(eq(pointsLedger.userId, userId), eq(pointsLedger.refKey, refKey)));
  return row;
}

/** Locks the user row: the one lock that serialises everything that spends this user's points. */
export async function lockUser(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  return rows.length > 0;
}

export async function findUserByEmail(run: Run, email: string) {
  const [row] = await run
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email));
  return row;
}

// ---- per-order sums, for redeeming and reversing ----

const sumFor = (
  orderId: string,
  kind: 'earn' | 'redeem' | 'reversal',
  sign: 'pos' | 'neg' | 'any',
) =>
  sql<number>`coalesce(sum(${pointsLedger.delta}) filter (where ${pointsLedger.orderId} = ${orderId} and ${pointsLedger.kind} = ${kind} ${
    sign === 'pos'
      ? sql`and ${pointsLedger.delta} > 0`
      : sign === 'neg'
        ? sql`and ${pointsLedger.delta} < 0`
        : sql``
  }), 0)::int`;

export interface OrderPoints {
  earned: number;
  /** Points paid with at checkout (positive number). */
  redeemed: number;
  /** Earned points already taken back (positive number). */
  clawedBack: number;
  /** Redeemed points already given back (positive number). */
  givenBack: number;
}

export async function pointsOfOrder(run: Run, orderId: string): Promise<OrderPoints> {
  const [row] = await run
    .select({
      earned: sumFor(orderId, 'earn', 'any'),
      redeemed: sumFor(orderId, 'redeem', 'any'),
      clawed: sumFor(orderId, 'reversal', 'neg'),
      given: sumFor(orderId, 'reversal', 'pos'),
    })
    .from(pointsLedger);
  return {
    earned: row?.earned ?? 0,
    redeemed: -(row?.redeemed ?? 0),
    clawedBack: -(row?.clawed ?? 0),
    givenBack: row?.given ?? 0,
  };
}

export async function deleteEntry(run: Run, refKey: string): Promise<void> {
  await run.delete(pointsLedger).where(eq(pointsLedger.refKey, refKey));
}
