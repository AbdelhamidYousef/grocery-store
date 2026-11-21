import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { productVariants } from './product-variants.ts';
import { products } from './products.ts';
import { users } from './users.ts';

// One default list per account ("Saved": the wishlist, `is_default`) plus any named lists (G9.3), or
// one per guest browser (the signed `wishlist_id` cookie holds `id`; the `guest_token` column is a
// second secret so the cookie alone is not the only thing naming it). `share_token` is set while the
// owner shares a read-only link and cleared to revoke it; it belongs to the default list.
export const wishlists = pgTable(
  'wishlists',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    // "Saved" for the default list; a shopper-chosen name (1 to 40 characters) for the others.
    name: text('name').notNull().default('Saved'),
    isDefault: boolean('is_default').notNull().default(true),
    guestToken: text('guest_token').unique(),
    shareToken: text('share_token').unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One default list per account, and no two lists of one account with the same name (case aside).
    uniqueIndex('wishlists_one_default_per_user_idx')
      .on(t.userId)
      .where(sql`${t.isDefault} and ${t.userId} is not null`),
    uniqueIndex('wishlists_user_name_idx')
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.userId} is not null`),
    check('wishlists_name_check', sql`char_length(${t.name}) between 1 and 40`),
    check(
      'wishlists_owner_check',
      sql`(${t.userId} IS NOT NULL AND ${t.guestToken} IS NULL) OR (${t.userId} IS NULL AND ${t.guestToken} IS NOT NULL)`,
    ),
  ],
);

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: id(),
    wishlistId: uuid('wishlist_id')
      .notNull()
      .references(() => wishlists.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
    // How many of it the list is for (G9.3); the wishlist heart saves one.
    quantity: integer('quantity').notNull().default(1),
    createdAt: createdAt(),
  },
  // NULLS NOT DISTINCT: "this product, no specific variant" is also unique per list.
  (t) => [
    unique('wishlist_items_unique').on(t.wishlistId, t.productId, t.variantId).nullsNotDistinct(),
    check('wishlist_items_quantity_check', sql`${t.quantity} between 1 and 99`),
  ],
);
