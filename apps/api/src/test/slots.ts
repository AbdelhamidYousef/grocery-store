import { db } from '../db/client.ts';
import { cancelPendingOrder } from '../modules/checkout/orders.ts';

/** Cancels a pending order the way the payment webhook and the sweeper do (frees its slot place). */
export async function cancelOrderForTest(orderId: string): Promise<void> {
  await db.transaction((tx) =>
    cancelPendingOrder(tx, orderId, { actor: 'system:test', note: 'cancelled by a test' }),
  );
}
