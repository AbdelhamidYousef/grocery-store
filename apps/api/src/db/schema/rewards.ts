import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

export const rewardKind = pgEnum('reward_kind', ['coupon_fixed', 'free_shipping', 'gift']);

// What points can buy. Redeeming debits the ledger and mints a personal single-use discount code
// (phase 18), so a reward is a recipe for a code, not a second discount mechanism:
//   coupon_fixed:  a fixed amount off (value_cents)
//   free_shipping: free delivery (value_cents is 0)
//   gift:          a "free product" worth value_cents, minted as a fixed amount off the price of
//                  that product's value (the engine adds no zero-price lines for codes)
export const rewards = pgTable(
  'rewards',
  {
    id: id(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    costPoints: integer('cost_points').notNull(),
    kind: rewardKind('kind').notNull(),
    valueCents: integer('value_cents').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('rewards_cost_check', sql`${t.costPoints} > 0`),
    check(
      'rewards_value_check',
      sql`(${t.kind} = 'free_shipping' AND ${t.valueCents} = 0) OR (${t.kind} <> 'free_shipping' AND ${t.valueCents} > 0)`,
    ),
  ],
);
