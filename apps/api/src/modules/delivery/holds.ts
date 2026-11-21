import {
  ErrorCode,
  SLOT_RULES,
  isSlotClosed,
  isStoreOpen,
  type CartDelivery,
  type ExpressAvailability,
} from '@store/shared';
import { and, count, eq, gt, lt, ne, notInArray, sql } from 'drizzle-orm';

import type { db, Tx } from '../../db/client.ts';
import { carts, darkStores, deliverySlots, orders, slotHolds } from '../../db/schema/index.ts';
import { notFound, slotError } from '../../lib/errors.ts';

// Slot holds and capacity. Read the comments here before changing anything: this is the part of
// the shop where two shoppers can want the same last place at the same moment.
//
//   * A slot is full when `active holds + booked orders >= capacity`. Both are COUNTED from rows
//     that exist; nothing stores a "booked" number that a forgotten code path could leave wrong.
//   * Counting is only safe if nobody else counts-and-inserts in between, so every booking first
//     locks the slot row (`SELECT ... FOR UPDATE`): the second shopper waits, then counts again and
//     sees the place gone. Express does the same with the store row.
//   * Lock order is always cart -> slot (or store) -> inventory, so no two flows wait on each other.
//   * A hold is the cart's, one per cart, and stops counting at `expires_at` by itself. Nothing has
//     to run for a place to come back; the `release-slot-holds` job only deletes old rows.
//   * Placing the order deletes the hold and writes the slot on the order in one transaction
//     (checkout), so the place is never counted twice or not at all. A cancelled or refunded order
//     is not counted, which is how its place comes back.

type Run = typeof db | Tx;

const DEAD_ORDERS = ['cancelled', 'refunded'] as const;
const HOLD_MS = SLOT_RULES.holdMinutes * 60_000;
const EXPRESS_MS = SLOT_RULES.expressMinutes * 60_000;

/** "08:00:00" (Postgres `time`) to "08:00". */
export const hhmm = (time: string): string => time.slice(0, 5);

export type SlotRow = typeof deliverySlots.$inferSelect;
export type StoreRow = typeof darkStores.$inferSelect;

export async function lockSlot(tx: Tx, slotId: string): Promise<SlotRow | undefined> {
  const [row] = await tx
    .select()
    .from(deliverySlots)
    .where(eq(deliverySlots.id, slotId))
    .for('update');
  return row;
}

export async function lockStore(tx: Tx, storeId: string): Promise<StoreRow | undefined> {
  const [row] = await tx.select().from(darkStores).where(eq(darkStores.id, storeId)).for('update');
  return row;
}

/**
 * Places taken on a slot: holds that have not expired plus orders that are not cancelled or
 * refunded. `exceptCartId` leaves out the asking cart's own hold and its own (pending) order, so
 * re-picking a slot never competes with yourself. Call it with the slot row locked.
 */
export async function takenPlaces(
  run: Run,
  slotId: string,
  now: Date,
  exceptCartId?: string,
): Promise<number> {
  const [holds] = await run
    .select({ n: count() })
    .from(slotHolds)
    .where(
      and(
        eq(slotHolds.slotId, slotId),
        gt(slotHolds.expiresAt, now),
        exceptCartId ? ne(slotHolds.cartId, exceptCartId) : undefined,
      ),
    );
  const [booked] = await run
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.slotId, slotId),
        notInArray(orders.status, [...DEAD_ORDERS]),
        exceptCartId ? sql`${orders.cartId} is distinct from ${exceptCartId}` : undefined,
      ),
    );
  return (holds?.n ?? 0) + (booked?.n ?? 0);
}

/** Express orders of a store inside the rider window, not counting the asking cart's own. */
export async function expressInWindow(
  run: Run,
  storeId: string,
  now: Date,
  exceptCartId?: string,
): Promise<number> {
  const [row] = await run
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.darkStoreId, storeId),
        eq(orders.deliveryKind, 'express'),
        gt(orders.createdAt, new Date(now.getTime() - EXPRESS_MS)),
        notInArray(orders.status, [...DEAD_ORDERS]),
        exceptCartId ? sql`${orders.cartId} is distinct from ${exceptCartId}` : undefined,
      ),
    );
  return row?.n ?? 0;
}

/** Open now, with the whole 30-minute window inside the opening hours, and a rider free. */
export async function expressStatus(
  run: Run,
  store: StoreRow,
  now: Date,
  exceptCartId?: string,
): Promise<ExpressAvailability> {
  const opens = hhmm(store.opensAt);
  const closes = hhmm(store.closesAt);
  const windowEnd = new Date(now.getTime() + EXPRESS_MS - 1);
  if (!isStoreOpen(now, opens, closes) || !isStoreOpen(windowEnd, opens, closes)) {
    return { available: false, reason: 'closed' };
  }
  if ((await expressInWindow(run, store.id, now, exceptCartId)) >= store.expressRiders) {
    return { available: false, reason: 'busy' };
  }
  return { available: true };
}

// ---------- the cart's choice ----------

/** Picks (or re-picks, which extends) the cart's slot. Runs inside the cart mutation: cart locked. */
export async function putSlot(
  tx: Tx,
  cart: { id: string },
  slotId: string,
  storeId: string,
  now: Date,
): Promise<void> {
  const slot = await lockSlot(tx, slotId);
  if (!slot) throw notFound('Delivery slot not found');
  if (slot.storeId !== storeId) {
    throw slotError(ErrorCode.SLOT_WRONG_AREA, 'This slot belongs to another delivery area');
  }
  if (isSlotClosed(slot.startsAt, now)) {
    throw slotError(ErrorCode.SLOT_CLOSED, 'This slot can no longer be booked');
  }
  if ((await takenPlaces(tx, slot.id, now, cart.id)) >= slot.capacity) {
    throw slotError(ErrorCode.SLOT_FULL, 'This slot is full', { slotId: slot.id });
  }
  const expiresAt = new Date(now.getTime() + HOLD_MS);
  await tx
    .insert(slotHolds)
    .values({ slotId: slot.id, cartId: cart.id, expiresAt })
    .onConflictDoUpdate({ target: slotHolds.cartId, set: { slotId: slot.id, expiresAt } });
  await tx.update(carts).set({ express: false }).where(eq(carts.id, cart.id));
}

/** Chooses express: refused unless the store is open and has a rider free right now. */
export async function putExpress(
  tx: Tx,
  cart: { id: string },
  delivery: { served: boolean; storeId: string },
  now: Date,
): Promise<void> {
  if (!delivery.served) {
    throw slotError(ErrorCode.EXPRESS_UNAVAILABLE, 'Enter your postcode for express delivery', {
      reason: 'no_postcode',
    });
  }
  const store = await lockStore(tx, delivery.storeId);
  if (!store) throw notFound('Store not found');
  const status = await expressStatus(tx, store, now, cart.id);
  if (!status.available) {
    throw slotError(ErrorCode.EXPRESS_UNAVAILABLE, 'Express delivery is not available right now', {
      reason: status.reason,
    });
  }
  await tx.delete(slotHolds).where(eq(slotHolds.cartId, cart.id));
  await tx.update(carts).set({ express: true }).where(eq(carts.id, cart.id));
}

/** Drops the cart's slot or express choice (and frees the held place). */
export async function clearDelivery(tx: Tx, cart: { id: string }): Promise<void> {
  await tx.delete(slotHolds).where(eq(slotHolds.cartId, cart.id));
  await tx.update(carts).set({ express: false }).where(eq(carts.id, cart.id));
}

/** What the cart response says about delivery: a live hold, express, or nothing. */
export async function cartDelivery(
  run: Run,
  cart: { id: string; express: boolean },
  now: Date,
): Promise<CartDelivery | null> {
  if (cart.express) return { kind: 'express', slot: null, holdExpiresAt: null };
  const [row] = await run
    .select({ slot: deliverySlots, expiresAt: slotHolds.expiresAt })
    .from(slotHolds)
    .innerJoin(deliverySlots, eq(deliverySlots.id, slotHolds.slotId))
    .where(and(eq(slotHolds.cartId, cart.id), gt(slotHolds.expiresAt, now)));
  if (!row) return null;
  return {
    kind: 'slot',
    slot: {
      id: row.slot.id,
      startsAt: row.slot.startsAt.toISOString(),
      endsAt: row.slot.endsAt.toISOString(),
    },
    holdExpiresAt: row.expiresAt.toISOString(),
  };
}

// ---------- checkout ----------

export interface TakenDelivery {
  deliveryKind: 'slot' | 'express';
  slotId: string | null;
  deliveryFrom: Date;
  deliveryTo: Date;
}

/**
 * Turns the cart's choice into the order's delivery, inside the order transaction (cart locked).
 * A slot needs a LIVE hold on a slot of the address's store; the hold is deleted here, in the same
 * transaction that reserves the stock and writes the order, so a place never goes missing or
 * counts twice. Express is checked again under a lock on the store. A retried payment (a pending
 * order of this cart that already carries a slot, the hold having been used) keeps that slot.
 */
export async function takeDelivery(
  tx: Tx,
  p: {
    cart: { id: string; express: boolean };
    storeId: string;
    pending: { deliveryKind: string | null; slotId: string | null } | undefined;
    now: Date;
  },
): Promise<TakenDelivery> {
  const { cart, storeId, pending, now } = p;
  const wrongArea = () =>
    slotError(ErrorCode.SLOT_WRONG_AREA, 'Your delivery slot is for another delivery area');

  if (cart.express || (!(await holdOf(tx, cart.id)) && pending?.deliveryKind === 'express')) {
    const store = await lockStore(tx, storeId);
    if (!store) throw notFound('Store not found');
    const status = await expressStatus(tx, store, now, cart.id);
    if (!status.available) {
      throw slotError(
        ErrorCode.EXPRESS_UNAVAILABLE,
        'Express delivery is not available right now',
        {
          reason: status.reason,
        },
      );
    }
    // The cart's own hold, if the shopper had one before switching to express, is not needed.
    await tx.delete(slotHolds).where(eq(slotHolds.cartId, cart.id));
    return {
      deliveryKind: 'express',
      slotId: null,
      deliveryFrom: now,
      deliveryTo: new Date(now.getTime() + EXPRESS_MS),
    };
  }

  const hold = await holdOf(tx, cart.id);
  if (hold) {
    if (hold.expiresAt.getTime() <= now.getTime()) {
      throw slotError(
        ErrorCode.SLOT_HOLD_EXPIRED,
        'Your delivery slot was held for 15 minutes and has expired',
        {
          slotId: hold.slot.id,
        },
      );
    }
    if (hold.slot.storeId !== storeId) throw wrongArea();
    await tx.delete(slotHolds).where(eq(slotHolds.id, hold.id));
    return {
      deliveryKind: 'slot',
      slotId: hold.slot.id,
      deliveryFrom: hold.slot.startsAt,
      deliveryTo: hold.slot.endsAt,
    };
  }

  if (pending?.deliveryKind === 'slot' && pending.slotId) {
    const [slot] = await tx
      .select()
      .from(deliverySlots)
      .where(eq(deliverySlots.id, pending.slotId));
    if (slot) {
      if (slot.storeId !== storeId) throw wrongArea();
      // The pending order itself is counted against the slot, so its place is already safe; only
      // a slot that has meanwhile closed (the shopper came back much later) is refused.
      if (isSlotClosed(slot.startsAt, now)) {
        throw slotError(ErrorCode.SLOT_CLOSED, 'This slot can no longer be booked');
      }
      return {
        deliveryKind: 'slot',
        slotId: slot.id,
        deliveryFrom: slot.startsAt,
        deliveryTo: slot.endsAt,
      };
    }
  }

  throw slotError(ErrorCode.DELIVERY_REQUIRED, 'Choose a delivery time before paying');
}

async function holdOf(run: Run, cartId: string) {
  const [row] = await run
    .select({
      id: slotHolds.id,
      expiresAt: slotHolds.expiresAt,
      slot: deliverySlots,
    })
    .from(slotHolds)
    .innerJoin(deliverySlots, eq(deliverySlots.id, slotHolds.slotId))
    .where(eq(slotHolds.cartId, cartId));
  return row;
}

/**
 * Gives the shopper their slot back after a checkout that could not reach the payment provider (the
 * order was cancelled, so its place is free again): a new hold if the place is still free and the
 * slot still bookable, nothing otherwise (the shopper then picks again). Its own transaction, taken
 * in the usual order: cart, then slot.
 */
export async function restoreHold(
  tx: Tx,
  order: { cartId: string | null; slotId: string | null },
  now: Date,
): Promise<boolean> {
  if (!order.cartId || !order.slotId) return false;
  const [cart] = await tx.select().from(carts).where(eq(carts.id, order.cartId)).for('update');
  const slot = await lockSlot(tx, order.slotId);
  if (!cart || !slot || isSlotClosed(slot.startsAt, now)) return false;
  if ((await takenPlaces(tx, slot.id, now, cart.id)) >= slot.capacity) return false;
  const expiresAt = new Date(now.getTime() + HOLD_MS);
  await tx
    .insert(slotHolds)
    .values({ slotId: slot.id, cartId: cart.id, expiresAt })
    .onConflictDoUpdate({ target: slotHolds.cartId, set: { slotId: slot.id, expiresAt } });
  return true;
}

// ---------- the job ----------

/**
 * Deletes holds that expired more than an hour ago, to keep the table small. Expired holds have
 * stopped counting long before: this is housekeeping, never what frees a place.
 */
export async function releaseOldHolds(run: Run, now: Date): Promise<{ deleted: number }> {
  const rows = await run
    .delete(slotHolds)
    .where(lt(slotHolds.expiresAt, new Date(now.getTime() - 3_600_000)))
    .returning({ id: slotHolds.id });
  return { deleted: rows.length };
}
