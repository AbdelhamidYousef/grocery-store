import { randomUUID } from 'node:crypto';

import {
  nextTierFor,
  pointsForCents,
  tierFor,
  type AdminPointsAdjust,
  type PointsSummary,
} from '@store/shared';

import { db, type Tx } from '../../db/client.ts';
import { notFound, validation } from '../../lib/errors.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import {
  onOrderCancelled,
  onOrderPaid,
  onOrderRefunded,
  type OrderCancelledEvent,
  type OrderPaidEvent,
  type OrderRefundedEvent,
} from '../orders/events.ts';

import * as repo from './repo.ts';

const HISTORY_LIMIT = 50;

export async function getSummary(userId: string): Promise<PointsSummary> {
  const [stand, rows] = await Promise.all([
    repo.standing(db, userId),
    repo.recentEntries(db, userId, HISTORY_LIMIT),
  ]);
  const tier = tierFor(stand.lifetimeEarned);
  const next = nextTierFor(stand.lifetimeEarned);
  return {
    balance: stand.balance,
    lifetimeEarned: stand.lifetimeEarned,
    tier: { id: tier.id, label: tier.label, ratePercent: tier.ratePercent },
    nextTier: next
      ? { id: next.tier.id, label: next.tier.label, pointsNeeded: next.pointsNeeded }
      : null,
    entries: rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      kind: r.kind,
      orderNumber: r.orderNumber,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ---------- earning ----------

// What an order earns: its merchandise after every discount (the points it was paid with and any
// code are already inside `discountCents`), never shipping, never the donation. The tier is the one
// the customer had BEFORE this order, so an order cannot lift its own rate.
export async function awardForOrder(tx: Tx, orderId: string): Promise<number> {
  const order = await checkoutRepo.findOrderById(tx, orderId);
  if (!order?.userId) return 0; // guests earn nothing
  const base = Math.max(0, order.subtotalCents - order.discountCents);
  const { lifetimeEarned } = await repo.standing(tx, order.userId);
  const points = pointsForCents(base, tierFor(lifetimeEarned));
  if (points <= 0) return 0;
  const written = await repo.insertEntry(tx, {
    userId: order.userId,
    delta: points,
    kind: 'earn',
    orderId,
    refKey: `earn:${orderId}`,
    reason: `Order ${order.number}`,
  });
  return written ? points : 0;
}

// ---------- redeeming at checkout ----------

// Called by checkout inside its transaction, BEFORE pricing. The user row lock is what makes two
// checkouts of one customer queue up: the second reads the balance after the first has written its
// `redeem` row, so the same points can never be spent twice. `pendingOrderId` is the order being
// re-placed: its own earlier redemption is not "spent" against it (it is rewritten below).
export async function assertCanRedeem(
  tx: Tx,
  userId: string,
  requested: number,
  pendingOrderId?: string,
): Promise<void> {
  await repo.lockUser(tx, userId);
  const { balance } = await repo.standing(tx, userId);
  const own = pendingOrderId ? (await repo.pointsOfOrder(tx, pendingOrderId)).redeemed : 0;
  const available = Math.max(0, balance + own);
  if (requested > available) {
    throw validation(
      {
        formErrors: [],
        fieldErrors: { pointsToRedeem: [`You have ${available} points to use`] },
      },
      'Not enough points',
    );
  }
}

// Writes (or rewrites) the order's single `redeem` row, in the order's own transaction. `points`
// is what the engine actually applied (it caps credits at the merchandise left), so a customer is
// never charged points for value they did not receive. Rewriting is only ever done to an order
// that is still `pending_payment` (checkout holds its row lock), so no history is rewritten.
export async function recordRedemption(
  tx: Tx,
  userId: string,
  orderId: string,
  points: number,
): Promise<void> {
  await repo.deleteEntry(tx, `redeem:${orderId}`);
  if (points <= 0) return;
  await repo.insertEntry(tx, {
    userId,
    delta: -points,
    kind: 'redeem',
    orderId,
    refKey: `redeem:${orderId}`,
    reason: 'Paid part of an order',
  });
}

// ---------- reversal ----------

// Reversal instead of edit: a cancelled or refunded order adds rows, it never changes old ones.
//  - earned points are taken back in proportion to what was refunded (everything left on a full
//    refund). The claw-back is clamped to the CURRENT balance: if the customer has already spent
//    the points, we do not push them below zero (only an admin `adjust` can do that). Documented
//    in the decisions log.
//  - points the customer paid with come back in the same proportion (a failed or cancelled order
//    returns all of them).
// `tag` is the idempotency key suffix, so a redelivered event writes nothing the second time.
async function reverseOrder(
  tx: Tx,
  orderId: string,
  tag: string,
  portion: { full: true } | { full: false; refundedCents: number },
): Promise<void> {
  const order = await checkoutRepo.findOrderById(tx, orderId);
  if (!order?.userId) return;
  const p = await repo.pointsOfOrder(tx, orderId);

  await repo.lockUser(tx, order.userId);
  const redeemedLeft = p.redeemed - p.givenBack;
  if (redeemedLeft > 0) {
    const back = portion.full
      ? redeemedLeft
      : Math.min(
          redeemedLeft,
          Math.floor(
            (p.redeemed * portion.refundedCents) / Math.max(1, order.totalCents + p.redeemed),
          ),
        );
    if (back > 0) {
      await repo.insertEntry(tx, {
        userId: order.userId,
        delta: back,
        kind: 'reversal',
        orderId,
        refKey: `giveback:${tag}`,
        reason: 'Points returned: order cancelled or refunded',
      });
    }
  }

  // Then take the earned points back, clamped to the balance AFTER the give-back.
  const earnedLeft = p.earned - p.clawedBack;
  if (earnedLeft > 0) {
    const want = portion.full
      ? earnedLeft
      : Math.min(
          earnedLeft,
          Math.floor((p.earned * portion.refundedCents) / Math.max(1, order.totalCents)),
        );
    const { balance } = await repo.standing(tx, order.userId);
    const take = Math.min(want, Math.max(0, balance));
    if (take > 0) {
      await repo.insertEntry(tx, {
        userId: order.userId,
        delta: -take,
        kind: 'reversal',
        orderId,
        refKey: `reverse:${tag}`,
        reason: 'Points taken back: order cancelled or refunded',
      });
    }
  }
}

async function reverseOnCancelled(tx: Tx, { orderId }: OrderCancelledEvent): Promise<void> {
  await reverseOrder(tx, orderId, `cancel:${orderId}`, { full: true });
}

async function reverseOnRefunded(tx: Tx, e: OrderRefundedEvent): Promise<void> {
  const tag = `refund:${e.refundId ?? `${e.orderId}:full`}`;
  await reverseOrder(
    tx,
    e.orderId,
    tag,
    e.full ? { full: true } : { full: false, refundedCents: e.refundedCents },
  );
}

// ---------- admin ----------

export async function adjust(input: AdminPointsAdjust, actor: string) {
  const user = await repo.findUserByEmail(db, input.email);
  if (!user) throw notFound('No account with that email');
  const refKey = `adjust:${randomUUID()}`;
  await repo.insertEntry(db, {
    userId: user.id,
    delta: input.delta,
    kind: 'adjust',
    refKey,
    reason: `${input.reason} (${actor})`,
  });
  const entry = await repo.findEntry(db, user.id, refKey);
  const stand = await repo.standing(db, user.id);
  if (!entry) throw new Error('adjustment row missing after insert');
  return {
    userId: user.id,
    balance: stand.balance,
    entry: {
      id: entry.id,
      delta: entry.delta,
      kind: entry.kind,
      orderNumber: null,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    },
  };
}

// ---------- order event subscribers ----------

async function earnOnPaid(tx: Tx, { orderId }: OrderPaidEvent): Promise<void> {
  await awardForOrder(tx, orderId);
}

// Called once at start-up (modules/index.ts); safe to call again (the registry is a set).
export function registerLoyaltySubscribers(): void {
  onOrderPaid(earnOnPaid);
  onOrderCancelled(reverseOnCancelled);
  onOrderRefunded(reverseOnRefunded);
}
