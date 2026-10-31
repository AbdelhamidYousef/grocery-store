import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { citext, createdAt, id, updatedAt } from './columns.ts';
import { orders } from './orders.ts';

export const withdrawalStatus = pgEnum('withdrawal_status', ['new', 'acknowledged', 'done']);

// EU right of withdrawal: a customer tells us, in plain words, that they withdraw from the
// contract. The row is the proof of WHEN they did (created_at), which is what the law cares about.
export const withdrawalRequests = pgTable(
  'withdrawal_requests',
  {
    id: id(),
    // CASCADE like the other order children; the shop's records of an order go with the order.
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Copied from the order at request time (the proof that the requester knew it).
    email: citext('email').notNull(),
    // Free text: "everything", or which items. The form cannot list items before the ownership
    // check passes, so the customer says it in words.
    itemsText: text('items_text'),
    reason: text('reason'),
    status: withdrawalStatus('status').notNull().default('new'),
    // When an admin moved it from `new`; null while nobody has looked.
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('withdrawal_requests_order_id_idx').on(t.orderId),
    index('withdrawal_requests_status_idx').on(t.status, t.createdAt),
  ],
);
