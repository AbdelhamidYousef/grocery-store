import { sql } from 'drizzle-orm';
import { check, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { productVariants } from './product-variants.ts';
import { products } from './products.ts';
import { users } from './users.ts';

// One list per account, or one per guest browser (the signed `wishlist_id` cookie holds `id`; the
// `guest_token` column is a second secret so the cookie alone is not the only thing naming it).
// `share_token` is set while the owner shares a read-only link and cleared to revoke it.
export const wishlists = pgTable(
  'wishlists',
  {
    id: id(),
    userId: uuid('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    guestToken: text('guest_token').unique(),
    shareToken: text('share_token').unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
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
    createdAt: createdAt(),
  },
  // NULLS NOT DISTINCT: "this product, no specific variant" is also unique per list.
  (t) => [
    unique('wishlist_items_unique').on(t.wishlistId, t.productId, t.variantId).nullsNotDistinct(),
  ],
);
