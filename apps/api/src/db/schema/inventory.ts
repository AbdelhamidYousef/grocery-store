import { sql } from 'drizzle-orm';
import { check, integer, pgTable, uuid } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './columns.ts';
import { productVariants } from './product-variants.ts';

// Separate from the variant so frequent stock writes do not rewrite (and bloat) the catalog row.
export const inventory = pgTable(
  'inventory',
  {
    variantId: uuid('variant_id')
      .primaryKey()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    // Held by pending orders. Available stock = quantity - reserved.
    reserved: integer('reserved').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Last line of defence: stock can never go negative even if a code path forgets to check.
    check('inventory_quantity_check', sql`${t.quantity} >= 0`),
    check('inventory_reserved_check', sql`${t.reserved} >= 0`),
  ],
);
