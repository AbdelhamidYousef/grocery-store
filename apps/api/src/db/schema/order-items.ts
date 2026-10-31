import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { orders } from './orders.ts';
import { productVariants } from './product-variants.ts';

// A snapshot of what was bought, not a reference to the live catalog: renaming, re-pricing or
// deleting a product later must not rewrite history or change an old invoice.
export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Kept only as a convenience link (e.g. "buy again"); null if the variant is deleted.
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    variantName: text('variant_name').notNull(),
    sku: text('sku').notNull(),
    imageUrl: text('image_url'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('order_items_order_id_idx').on(t.orderId),
    index('order_items_variant_id_idx').on(t.variantId),
    check('order_items_quantity_check', sql`${t.quantity} > 0`),
    check('order_items_unit_price_check', sql`${t.unitPriceCents} >= 0`),
    check(
      'order_items_line_total_check',
      sql`${t.lineTotalCents} = ${t.unitPriceCents} * ${t.quantity}`,
    ),
  ],
);
