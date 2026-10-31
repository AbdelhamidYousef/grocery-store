import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { carts } from './carts.ts';
import { createdAt, id, updatedAt } from './columns.ts';
import { productVariants } from './product-variants.ts';

// The cart is always re-priced from the catalog on read, so no price here is ever *charged*.
// `last_seen_price_cents` only remembers what the shopper last saw, to power the "price changed"
// warning: when the catalog price differs on read we warn once, then store the new value.
export const cartItems = pgTable(
  'cart_items',
  {
    id: id(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    // No cascade: a variant that is in carts must be archived, not deleted.
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    quantity: integer('quantity').notNull(),
    // Null for lines created before this column existed: nothing to compare, so no warning.
    lastSeenPriceCents: integer('last_seen_price_cents'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('cart_items_quantity_check', sql`${t.quantity} BETWEEN 1 AND 99`),
    // Adding the same variant twice must bump the quantity, not create a second line.
    uniqueIndex('cart_items_cart_variant_idx').on(t.cartId, t.variantId),
    index('cart_items_variant_id_idx').on(t.variantId),
  ],
);
