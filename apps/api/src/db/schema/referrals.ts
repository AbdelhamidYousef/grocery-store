import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { orders } from './orders.ts';
import { discountCodes } from './promotions.ts';
import { users } from './users.ts';

// One shareable code per customer (`/?ref=CODE`). Made on first use.
export const referralCodes = pgTable('referral_codes', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  createdAt: createdAt(),
});

export const referralStatus = pgEnum('referral_status', ['pending', 'qualified', 'rejected']);

// One row per referred account (`referred_user_id` unique: a person can be referred once, ever).
// `pending` until their first paid order of at least EUR 20; then `qualified` (both sides get a
// personal code) or `rejected` with a reason. The two minted codes are remembered so that a full
// refund of the qualifying order can void them while they are still unused.
export const referrals = pgTable(
  'referrals',
  {
    id: id(),
    referrerId: uuid('referrer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referredUserId: uuid('referred_user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: referralStatus('status').notNull().default('pending'),
    rejectReason: text('reject_reason'),
    qualifiedOrderId: uuid('qualified_order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    referrerCodeId: uuid('referrer_code_id').references(() => discountCodes.id, {
      onDelete: 'set null',
    }),
    refereeCodeId: uuid('referee_code_id').references(() => discountCodes.id, {
      onDelete: 'set null',
    }),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('referrals_referrer_status_idx').on(t.referrerId, t.status)],
);
