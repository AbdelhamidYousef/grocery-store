import type { OrderStatus, WithdrawalBody, WithdrawalReceipt } from '@store/shared';

import { db } from '../../db/client.ts';
import { withdrawalRequests } from '../../db/schema/index.ts';
import { conflict, notFound } from '../../lib/errors.ts';
import { enqueueEmail, type Outbox } from '../mail/outbox.ts';
import { findOwnedOrder } from '../tracking/ownership.ts';
import { NO_SUCH_ORDER } from '../tracking/service.ts';

// ADAPTER (phase 20 <-> phase 14): phase 14's `isPaidOrLater(status)` says "every status except
// pending_payment and cancelled". After the merge, replace this body with that function.
const isWithdrawable = (status: OrderStatus): boolean =>
  status !== 'pending_payment' && status !== 'cancelled';

// What the customer sees as the reference: short, readable, derived from the row id.
export const referenceOf = (id: string): string => `WD-${id.slice(0, 8).toUpperCase()}`;

export async function createWithdrawal(
  body: WithdrawalBody,
  deps: { outbox: Outbox },
): Promise<WithdrawalReceipt> {
  // The same ownership proof and the same 404 as order tracking: this form must not become a way
  // to ask whether an order number exists.
  const order = await findOwnedOrder(body.orderNumber, body.email);
  if (!order) throw notFound(NO_SUCH_ORDER);
  if (!isWithdrawable(order.status)) {
    throw conflict(
      'CONFLICT',
      'This order was not completed, so there is nothing to withdraw from.',
    );
  }

  // The row and its acknowledgement email commit together (the outbox pattern), so a customer is
  // never told "received" without a record, and a record is never left without the email.
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(withdrawalRequests)
      .values({
        orderId: order.id,
        email: order.email,
        itemsText: body.itemsText ?? null,
        reason: body.reason ?? null,
      })
      .returning();
    if (!created) throw new Error('withdrawal insert returned no row');
    await enqueueEmail(tx, {
      kind: 'withdrawal_ack',
      to: order.email,
      orderId: order.id,
      // One acknowledgement per request: a second, partial withdrawal for the same order is legal.
      dedupeKey: `withdrawal_ack:${created.id}`,
      payload: {
        reference: referenceOf(created.id),
        requestedAt: created.createdAt.toISOString(),
        itemsText: created.itemsText,
        reason: created.reason,
      },
    });
    return created;
  });
  deps.outbox.kick();

  return {
    reference: referenceOf(row.id),
    orderNumber: order.number,
    requestedAt: row.createdAt.toISOString(),
  };
}
