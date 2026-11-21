import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './columns.ts';
import { darkStores } from './delivery.ts';
import { productVariants } from './product-variants.ts';

// Stock is held per dark store: the same yoghurt is one row per store, and the row that matters is
// the one of the store that will pack the bag. Separate from the variant so frequent stock writes do
// not rewrite (and bloat) the catalog row.
export const inventory = pgTable(
  'inventory',
  {
    // Cascade both ways: a stock row means nothing without its store or its variant.
    storeId: uuid('store_id')
      .notNull()
      .references(() => darkStores.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    // Held by pending orders. Available stock = quantity - reserved.
    reserved: integer('reserved').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.variantId] }),
    // The admin reads every store's row of one variant.
    index('inventory_variant_id_idx').on(t.variantId),
    // Last line of defence: stock can never go negative even if a code path forgets to check.
    check('inventory_quantity_check', sql`${t.quantity} >= 0`),
    check('inventory_reserved_check', sql`${t.reserved} >= 0`),
  ],
);
