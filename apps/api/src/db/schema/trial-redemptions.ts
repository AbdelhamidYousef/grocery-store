import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { orders } from './orders.ts';
import { productVariants } from './product-variants.ts';

// "One trial unit per customer per variant, ever." `customer_key` is the user id, or the
// lowercased email for a guest. A cancelled order *releases* its row (released_at) instead of
// deleting it, so history stays; the partial unique index only counts live rows, which makes the
// rule hold even if two checkouts race past the service-level check.
export const trialRedemptions = pgTable(
  'trial_redemptions',
  {
    id: id(),
    customerKey: text('customer_key').notNull(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('trial_redemptions_live_idx')
      .on(t.customerKey, t.variantId)
      .where(sql`${t.releasedAt} is null`),
    index('trial_redemptions_order_id_idx').on(t.orderId),
  ],
);
