import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { orderItems } from './order-items.ts';
import { orders } from './orders.ts';
import { users } from './users.ts';

// A return is its own entity with its own states (RMA), not an order status: the order stays
// `delivered` while some lines come back, and becomes `refunded` only when every line is returned
// and refunded. See modules/returns/state-machine.ts for the edges.
export const returnStatus = pgEnum('return_status', [
  'requested',
  'approved',
  'rejected',
  'received',
  'refunded',
]);

export const returnReason = pgEnum('return_reason', [
  'wrong_size',
  'damaged',
  'not_as_described',
  'changed_mind',
  'other',
]);

export const returns = pgTable(
  'returns',
  {
    id: id(),
    // Cascade like the other order children: the shop's records of an order go with the order.
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // The requester (the order's owner). SET NULL so deleting an account keeps the shop's records.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    status: returnStatus('status').notNull().default('requested'),
    reason: returnReason('reason').notNull(),
    note: text('note'),
    rejectReason: text('reject_reason'),
    // Money handed back for this return. At request time: the lines' share (price paid minus the
    // order-level discounts allocated to the line). At refund time it also holds the shipping if
    // the admin ticked it. Integer cents.
    refundCents: integer('refund_cents').notNull(),
    refundShipping: boolean('refund_shipping').notNull().default(false),
    // Written BEFORE the gateway is called (the "intent"): from then on the amount and the
    // shipping choice are frozen, because the retry key `return-<id>` must always mean the same
    // refund. A return with an intent but no provider refund id is a refund that may or may not
    // have reached the provider; repeating the action is safe and finishes it.
    refundIntentAt: timestamp('refund_intent_at', { withTimezone: true }),
    providerRefundId: text('provider_refund_id'),
    // True when the refund was recorded without a payment provider (RETURNS_SIMULATED).
    simulated: boolean('simulated').notNull().default(false),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('returns_order_id_idx').on(t.orderId),
    index('returns_user_id_idx').on(t.userId),
    index('returns_status_created_idx').on(t.status, t.createdAt),
    check('returns_refund_check', sql`${t.refundCents} >= 0`),
  ],
);

export const returnItems = pgTable(
  'return_items',
  {
    id: id(),
    returnId: uuid('return_id')
      .notNull()
      .references(() => returns.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    // Per line, so one parcel can hold a damaged item and a wrong-size one; `damaged` lines are
    // not put back on the shelf when received.
    reason: returnReason('reason').notNull(),
    refundCents: integer('refund_cents').notNull(),
  },
  (t) => [
    index('return_items_return_id_idx').on(t.returnId),
    index('return_items_order_item_id_idx').on(t.orderItemId),
    check('return_items_quantity_check', sql`${t.quantity} > 0`),
    check('return_items_refund_check', sql`${t.refundCents} >= 0`),
  ],
);
