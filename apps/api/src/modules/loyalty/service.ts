import { randomUUID } from 'node:crypto';

import {
  nextTierFor,
  pointsForCents,
  tierFor,
  type AdminPointsAdjust,
  type PointsSummary,
} from '@store/shared';

import { db, type Tx } from '../../db/client.ts';
import { notFound } from '../../lib/errors.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import { onOrderPaid, type OrderPaidEvent } from '../orders/events.ts';

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
}
