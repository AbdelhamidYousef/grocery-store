import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { orderStatus, orders } from './orders.ts';

// Append-only audit log, so it has no updated_at.
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Null on the very first row, when the order is created and has no previous status.
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    // Who caused it: 'system:webhook', 'admin:<user_id>' or 'customer'.
    actor: text('actor').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('order_status_history_order_id_idx').on(t.orderId)],
);
