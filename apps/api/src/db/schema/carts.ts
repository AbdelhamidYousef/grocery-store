import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { users } from './users.ts';

export const cartStatus = pgEnum('cart_status', ['active', 'merged', 'converted', 'abandoned']);

export const carts = pgTable(
  'carts',
  {
    id: id(),
    // Null means a guest cart, tracked by a signed cookie. Carts go with their user: there is
    // nothing worth keeping for an account that no longer exists.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    status: cartStatus('status').notNull().default('active'),
    // Guest carts live 30 days, user carts 90; set by the cart service, so no default here.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('carts_user_id_idx').on(t.userId),
    // A user can have many finished carts (merged, converted, abandoned) but only one live one.
    // Guests are unaffected: NULL user_ids are never equal to each other in a unique index.
    uniqueIndex('carts_one_active_per_user_idx')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  ],
);
