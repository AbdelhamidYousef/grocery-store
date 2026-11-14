import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { citext, createdAt, updatedAt } from './columns.ts';
import { orders } from './orders.ts';

export const vetDecision = pgEnum('vet_decision', ['pending', 'approved', 'rejected']);

// The vet details a customer typed at checkout for an order with a vet-approval item, and what the
// (simulated) decision was. One row per order, so the order id is the key. Admin-only: the web's
// customer views never read it, and nothing is ever sent to the vet address (demo shop).
export const orderVetDetails = pgTable('order_vet_details', {
  orderId: uuid('order_id')
    .primaryKey()
    .references(() => orders.id, { onDelete: 'cascade' }),
  vetName: text('vet_name').notNull(),
  clinic: text('clinic').notNull(),
  vetEmail: citext('vet_email').notNull(),
  decision: vetDecision('decision').notNull().default('pending'),
  // 'admin:<email>', same convention as order history.
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  // Why it was rejected (shown to the customer).
  reason: text('reason'),
  // The fake code the simulated vet "confirmation" produced; logged on approval.
  confirmationCode: text('confirmation_code'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
