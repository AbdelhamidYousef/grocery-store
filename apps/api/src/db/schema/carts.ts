import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { citext, createdAt, id, updatedAt } from './columns.ts';
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
    // The discount code the shopper applied (phase 18). Text, looked up on every pricing: a code
    // archived or edited since is re-checked, never trusted from when it was applied.
    discountCode: citext('discount_code'),
    // The store view the cart was last priced in, and its currency (phase 21). The cart is
    // re-priced from the store of each request, so these follow the shopper when they switch
    // store; they are what the cart was last shown in, never an input to a price.
    storeView: text('store_view').notNull().default('de-en'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    // The shopper chose express delivery (within 30 minutes). Mutually exclusive with a slot hold;
    // availability is checked when it is chosen and again, under a lock on the store, at checkout.
    express: boolean('express').notNull().default(false),
    // Paper bags at checkout (0.25 each, one per 8 units). false is "No bags, use boxes" (G9).
    bags: boolean('bags').notNull().default(true),
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
