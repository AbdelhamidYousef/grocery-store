import type { Tx } from '../../db/client.ts';
import { applyTransition } from '../orders/transition.ts';

import * as repo from './repo.ts';

// Lines that hold stock. `variantId` is null only when a variant was deleted after the order was
// placed, and a deleted variant has no inventory row left to give back.
interface HeldLine {
  variantId: string | null;
  quantity: number;
}

// Gives reserved units back to the shelf. Locks first (ordered, see `lockInventory`) so that a
// release can never deadlock with a checkout placing another order.
export async function releaseReservations(tx: Tx, lines: HeldLine[]): Promise<void> {
  const held = await repo.expandBundles(
    tx,
    lines.flatMap((l) =>
      l.variantId === null ? [] : [{ variantId: l.variantId, quantity: l.quantity }],
    ),
  );
  await repo.lockInventory(
    tx,
    held.map((l) => l.variantId),
  );
  for (const line of held) await repo.releaseStock(tx, line.variantId, line.quantity);
}

// Cancels an order that is still waiting for payment and returns its stock. It is the single
// implementation behind "Stripe failed while placing the order", the `payment_intent.canceled`
// webhook and the stale-reservation sweeper, so all three leave identical rows behind.
// It does nothing (and says so) if the order is no longer `pending_payment`: a paid order must
// never be cancelled by a late or duplicate signal, and a cancelled one must not release twice.
export async function cancelPendingOrder(
  tx: Tx,
  orderId: string,
  opts: { actor: string; note: string },
): Promise<boolean> {
  const order = await repo.lockOrder(tx, orderId);
  if (!order || order.status !== 'pending_payment') return false;
  await applyTransition(tx, order, 'cancelled', opts);
  return true;
}
