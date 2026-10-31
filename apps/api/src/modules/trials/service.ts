import { ErrorCode } from '@store/shared';

import { db, type Tx } from '../../db/client.ts';
import { conflict } from '../../lib/errors.ts';
import * as checkoutRepo from '../checkout/repo.ts';
import {
  onOrderCancelled,
  onOrderPaid,
  type OrderCancelledEvent,
  type OrderPaidEvent,
} from '../orders/events.ts';

import * as repo from './repo.ts';

// One trial unit per customer per variant, ever. The "customer" is the user id for an account and
// the lower-cased email for a guest (the only identity a guest has, given at checkout). The rule is
// enforced three times on purpose: the cart (friendly, early), checkout (authoritative, cannot be
// bypassed by editing the cart some other way) and a unique partial index (holds even if two
// checkouts race). A cart-only check would be bypassable.
export const customerKey = (userId: string | null, email: string): string =>
  userId ?? email.trim().toLowerCase();

type Run = typeof db | Tx;

export const trialLimit = (variantId: string, message: string) =>
  conflict(ErrorCode.TRIAL_LIMIT, message, { variantId });

/** Throws TRIAL_LIMIT when any of these cart lines breaks the trial rule for this customer. */
export async function assertTrialAllowed(
  run: Run,
  key: string | null,
  lines: { variantId: string; quantity: number }[],
): Promise<void> {
  const trialIds = new Set(
    await repo.filterTrialVariants(
      run,
      lines.map((l) => l.variantId),
    ),
  );
  if (trialIds.size === 0) return;
  for (const line of lines) {
    if (trialIds.has(line.variantId) && line.quantity > 1) {
      throw trialLimit(line.variantId, 'A trial size is limited to one per customer');
    }
  }
  if (key === null) return;
  const redeemed = await repo.redeemedVariants(run, key, [...trialIds]);
  if (redeemed[0]) {
    throw trialLimit(redeemed[0], 'You have already had this trial size');
  }
}

/** True when the variant is a trial size and this customer already redeemed it. */
export async function isRedeemed(run: Run, key: string, variantId: string): Promise<boolean> {
  return (await repo.redeemedVariants(run, key, [variantId])).length > 0;
}

export async function isTrialVariant(run: Run, variantId: string): Promise<boolean> {
  return (await repo.filterTrialVariants(run, [variantId])).length > 0;
}

// ---------- order event subscribers ----------

async function recordOnPaid(tx: Tx, { orderId }: OrderPaidEvent): Promise<void> {
  const order = await checkoutRepo.findOrderById(tx, orderId);
  if (!order) return;
  const items = await checkoutRepo.listOrderItems(tx, orderId);
  const variantIds = items.flatMap((i) => (i.variantId === null ? [] : [i.variantId]));
  const trialIds = await repo.filterTrialVariants(tx, variantIds);
  const key = customerKey(order.userId, order.email);
  await repo.recordRedemptions(
    tx,
    trialIds.map((variantId) => ({ customerKey: key, variantId, orderId })),
  );
}

async function releaseOnCancelled(tx: Tx, { orderId }: OrderCancelledEvent): Promise<void> {
  await repo.releaseForOrder(tx, orderId);
}

// Called once at start-up (modules/index.ts). Safe to call again: the registry is a set of
// function references.
export function registerTrialSubscribers(): void {
  onOrderPaid(recordOnPaid);
  onOrderCancelled(releaseOnCancelled);
}
