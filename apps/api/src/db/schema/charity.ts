import { sql } from 'drizzle-orm';
import {
  char,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { orders } from './orders.ts';
import { users } from './users.ts';

// The cause the shop supports. DEMO ONLY: the shelter is fictional and no money moves.
export const charities = pgTable('charities', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const donationSource = pgEnum('donation_source', ['points', 'round_up', 'reversal']);

// Append-only, like the points ledger. The running total is SUM(cents). A refunded order's round-up
// is not edited away: a `reversal` row with negative cents is added (ref `unround:<orderId>`).
export const donations = pgTable(
  'donations',
  {
    id: id(),
    charityId: uuid('charity_id')
      .notNull()
      .references(() => charities.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    cents: integer('cents').notNull(),
    // `cents` is in this currency (the order's, or the donor's store for a points donation); the
    // charity total is reported per currency, never summed across.
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    source: donationSource('source').notNull(),
    // Idempotency key: `roundup:<orderId>`, `unround:<orderId>`, `points:<uuid>`.
    refKey: text('ref_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('donations_ref_key_unique').on(t.refKey),
    index('donations_order_id_idx').on(t.orderId),
    check('donations_cents_check', sql`${t.cents} <> 0`),
    check(
      'donations_sign_check',
      sql`(${t.source} IN ('points', 'round_up') AND ${t.cents} > 0) OR (${t.source} = 'reversal' AND ${t.cents} < 0)`,
    ),
  ],
);
