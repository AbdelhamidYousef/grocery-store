import type { Tx } from '../../db/client.ts';
import { applyTransition } from '../orders/transition.ts';

import * as repo from './repo.ts';

// Gives reserved units back (from each line's checkout snapshot) to the shelf of the store that holds them. Locks first (ordered, see `lockInventory`) so that a
// release can never deadlock with a checkout placing another order.
export async function releaseReservations(
  tx: Tx,
  storeId: string,
  lines: Pick<repo.OrderItemRow, 'variantId' | 'quantity' | 'bundleComponents'>[],
): Promise<void> {
  const held = repo.expandOrderItems(lines);
  await repo.lockInventory(
    tx,
    storeId,
    held.map((l) => l.variantId),
  );
  for (const line of held) await repo.releaseStock(tx, storeId, line.variantId, line.quantity);
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
