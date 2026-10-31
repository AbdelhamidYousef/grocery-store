import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { productVariants } from './product-variants.ts';
import { products } from './products.ts';

export const productImages = pgTable(
  'product_images',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // Set for an image specific to one variant (a colour). If the variant goes, the image stays
    // as a plain product image rather than disappearing.
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    // A path under the web app's public folder now; a CDN URL later.
    url: text('url').notNull(),
    alt: text('alt').notNull(),
    // Known dimensions let the browser reserve space and avoid layout shift.
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('product_images_product_id_idx').on(t.productId),
    index('product_images_variant_id_idx').on(t.variantId),
  ],
);
