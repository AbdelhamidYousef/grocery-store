import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { id } from './columns.ts';
import { inventory } from './inventory.ts';
import { orderItems } from './order-items.ts';

// Which packs a stock row is made of: one row per delivery with its own best-before date.
// `inventory.quantity` stays the number every availability query reads; the invariant (tested after
// every write path) is: for each (store, variant), sum(stock_batches.quantity) = inventory.quantity.
// Batch rows are only written while the inventory row is locked (`lockInventory`), so the two
// numbers move in the same transaction.
export const stockBatches = pgTable(
  'stock_batches',
  {
    id: id(),
    storeId: uuid('store_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    // Null = does not expire (household goods); sorted last.
    bestBefore: date('best_before', { mode: 'string' }),
    quantity: integer('quantity').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.storeId, t.variantId],
      foreignColumns: [inventory.storeId, inventory.variantId],
      name: 'stock_batches_inventory_fk',
    }).onDelete('cascade'),
    index('stock_batches_store_variant_best_before_idx').on(t.storeId, t.variantId, t.bestBefore),
    check('stock_batches_quantity_check', sql`${t.quantity} >= 0`),
  ],
);

// The packs an order line took (from `commit`), so a cancel puts them back into the same batches
// and the picker knows which packs to pick. `variantId` of the batch is the component's for a kit.
export const orderItemBatches = pgTable(
  'order_item_batches',
  {
    id: id(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => stockBatches.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    // True when the line was sold as a short-dated offer.
    shortDated: boolean('short_dated').notNull().default(false),
  },
  (t) => [
    index('order_item_batches_item_idx').on(t.orderItemId),
    index('order_item_batches_batch_idx').on(t.batchId),
    check('order_item_batches_quantity_check', sql`${t.quantity} > 0`),
  ],
);
