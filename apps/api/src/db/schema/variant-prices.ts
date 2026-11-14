import { sql } from 'drizzle-orm';
import { char, check, integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './columns.ts';
import { productVariants } from './product-variants.ts';

// One price per variant per currency, in that currency's minor units. The EUR row mirrors
// `product_variants.price_cents` (a trigger keeps it in step, so the base column stays the one
// place the admin and the engine write EUR), every other currency is set by hand. A variant with
// no row for a store's currency has NO price there and is hidden in that store: prices are never
// converted.
export const variantPrices = pgTable(
  'variant_prices',
  {
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    currency: char('currency', { length: 3 }).notNull(),
    priceCents: integer('price_cents').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.currency] }),
    check('variant_prices_price_check', sql`${t.priceCents} >= 0`),
  ],
);
