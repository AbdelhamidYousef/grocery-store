import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { productStatus, products } from './products.ts';

export const productVariants = pgTable(
  'product_variants',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull().unique(),
    // Display name, e.g. "Red · Large".
    name: text('name').notNull(),
    options: jsonb('options').$type<Record<string, string>>().notNull(),
    // Money is integer minor units (cents), never a float.
    priceCents: integer('price_cents').notNull(),
    compareAtPriceCents: integer('compare_at_price_cents'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    weightGrams: integer('weight_grams').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    status: productStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('product_variants_price_cents_check', sql`${t.priceCents} >= 0`),
    // Also serves as the index on product_id (it is the leading column).
    uniqueIndex('product_variants_product_options_idx').on(t.productId, t.options),
    uniqueIndex('product_variants_one_default_idx')
      .on(t.productId)
      .where(sql`${t.isDefault}`),
  ],
);
