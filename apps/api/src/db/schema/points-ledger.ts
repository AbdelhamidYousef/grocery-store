import { sql } from 'drizzle-orm';
import { char, check, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { orders } from './orders.ts';
import { users } from './users.ts';

export const pointKind = pgEnum('point_kind', [
  'earn',
  'redeem',
  'reversal',
  'bonus',
  'donate',
  'adjust',
]);

// Append-only. The balance is SUM(delta) and is never stored, so there is no number to drift out
// of step with the history. A mistake is fixed by a new row (reversal / adjust), never an edit.
// `ref_key` is the idempotency key: `earn:<orderId>`, `redeem:<orderId>`, `refund:<orderId>`...
// A retried webhook or a double click inserts the same key twice, and the second insert is a no-op.
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: id(),
    // CASCADE: a deleted account takes its points with it (they are not sales records).
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    kind: pointKind('kind').notNull(),
    // SET NULL, like discount codes: history survives an order being removed.
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    refKey: text('ref_key').notNull().unique(),
    // The currency of the order the points came from or were spent on (null for adjustments and
    // donations without an order). Points are one balance; this only records what they were worth
    // when earned or spent (1 point = 1 minor unit of that currency).
    currency: char('currency', { length: 3 }),
    // Mandatory for `adjust` (who changed it and why); optional context for the others.
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('points_ledger_user_created_idx').on(t.userId, t.createdAt),
    index('points_ledger_order_id_idx').on(t.orderId),
    check('points_ledger_delta_check', sql`${t.delta} <> 0`),
    // Earn and bonus rows only ever add; redeem and donate only ever subtract.
    check(
      'points_ledger_sign_check',
      sql`(${t.kind} IN ('earn', 'bonus') AND ${t.delta} > 0) OR (${t.kind} IN ('redeem', 'donate') AND ${t.delta} < 0) OR ${t.kind} IN ('reversal', 'adjust')`,
    ),
  ],
);
