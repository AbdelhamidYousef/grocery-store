import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { darkStores } from './delivery.ts';
import { productVariants } from './product-variants.ts';

// Append-only record of every manual stock change, so "why is there 12 on the shelf?" always has
// an answer: who, when, how much, and why. No updated_at: rows are never edited.
// (Sales and cancellations are not here: they are in the order tables and history.)
export const inventoryAdjustments = pgTable(
  'inventory_adjustments',
  {
    id: id(),
    // Cascade: an adjustment is meaningless without its variant.
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    // The store whose shelf changed.
    storeId: uuid('store_id')
      .notNull()
      .references(() => darkStores.id, { onDelete: 'cascade' }),
    // Signed change applied to `inventory.quantity`.
    delta: integer('delta').notNull(),
    // 'restock' | 'correction' | 'damage' | 'return' (validated by the API with a shared enum).
    reason: text('reason').notNull(),
    // 'admin:<email>', same convention as order history.
    actor: text('actor').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('inventory_adjustments_variant_id_idx').on(t.variantId)],
);
