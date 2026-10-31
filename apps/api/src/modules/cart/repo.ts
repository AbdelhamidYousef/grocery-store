import { and, eq, gt, isNull } from 'drizzle-orm';

import { db, type Tx } from '../../db/client.ts';
import { carts } from '../../db/schema/index.ts';

export type CartRow = typeof carts.$inferSelect;
type Db = typeof db | Tx;

// Only a live guest cart qualifies: still `active`, owned by nobody, not expired. A cart that was
// merged, converted into an order, or now belongs to a user must never be reachable through a
// guest cookie, even a correctly signed one.
export async function findLiveGuestCart(id: string, run: Db = db): Promise<CartRow | undefined> {
  const [row] = await run
    .select()
    .from(carts)
    .where(
      and(
        eq(carts.id, id),
        isNull(carts.userId),
        eq(carts.status, 'active'),
        gt(carts.expiresAt, new Date()),
      ),
    );
  return row;
}

export async function findActiveUserCart(
  userId: string,
  run: Db = db,
): Promise<CartRow | undefined> {
  const [row] = await run
    .select()
    .from(carts)
    .where(and(eq(carts.userId, userId), eq(carts.status, 'active')));
  return row;
}

export async function insertGuestCart(expiresAt: Date, run: Db = db): Promise<CartRow> {
  const [row] = await run.insert(carts).values({ userId: null, expiresAt }).returning();
  if (!row) throw new Error('cart insert returned no row');
  return row;
}

// `ON CONFLICT DO NOTHING` (no target) absorbs the partial unique index "one active cart per
// user": when two requests race to create the first cart, the loser gets no row back and reads
// the winner's instead of failing.
export async function insertUserCartIfAbsent(
  userId: string,
  expiresAt: Date,
  run: Db = db,
): Promise<CartRow | undefined> {
  const [row] = await run
    .insert(carts)
    .values({ userId, expiresAt })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function markStatus(
  id: string,
  status: 'merged' | 'abandoned',
  run: Db = db,
): Promise<void> {
  await run.update(carts).set({ status }).where(eq(carts.id, id));
}
