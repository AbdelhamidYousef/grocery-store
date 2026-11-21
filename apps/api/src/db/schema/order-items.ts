import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { orders } from './orders.ts';
import { productVariants } from './product-variants.ts';
import { pickStatus, substitutionPreference, swapStatus } from './substitution.ts';

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
    // Sold as a short-dated offer: the packs come from short-dated batches, and until payment the
    // units count against the store's short-dated availability.
    shortDated: boolean('short_dated').notNull().default(false),
    // Bottle deposit of ONE unit, as ordered (G9). Units not found at packing are not charged it.
    depositCents: integer('deposit_cents').notNull().default(0),
    lineTotalCents: integer('line_total_cents').notNull(),
    // This line's share of the order-level discounts and credits (largest-remainder split by the
    // pricing engine). The single source for refund amounts (phase 22).
    discountCents: integer('discount_cents').notNull().default(0),
    // Sold by weight: the price per kg at checkout (null for any other line), the grams once packed
    // and the line's real price from them (`round(pricePerKg x grams / 1000)`, shared/weight.ts).
    // `line_total_cents` stays the estimate the order was priced at.
    pricePerKgCents: integer('price_per_kg_cents'),
    weighedGrams: integer('weighed_grams'),
    finalCents: integer('final_cents'),
    // What the packer typed on the scale (G8): changeable until the bag is dispatched, when
    // `finalizeOrder` freezes it into `weighed_grams` / `final_cents` once.
    packedGrams: integer('packed_grams'),
    // For a kit: the components one kit expanded to AT CHECKOUT ([{variantId, qty}] per kit). Stock
    // paths (release, commit, restock) read this, never the live `bundle_items`, so editing a kit
    // later cannot change what an existing order holds. Null for a plain variant.
    bundleComponents: jsonb('bundle_components').$type<{ variantId: string; qty: number }[]>(),
    // Copied from the cart line: what to do if the item is missing when the bag is packed.
    substitution: substitutionPreference('substitution').notNull().default('best_match'),
    substituteVariantId: uuid('substitute_variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),
    // Packing (G7): what the packer found. `picked_qty` is null until a shortfall is recorded (then every
    // unit counts as picked); `short` / `missing` lines are charged for the units found only.
    pickStatus: pickStatus('pick_status').notNull().default('pending'),
    pickedQty: integer('picked_qty'),
    // A substitute line points at the line it replaces; its price is min(its unit price, the
    // original's) and `swap_status` says whether the shopper took it. Null on every other line.
    substitutesItemId: uuid('substitutes_item_id').references((): AnyPgColumn => orderItems.id, {
      onDelete: 'cascade',
    }),
    swapStatus: swapStatus('swap_status'),
    // What a replacement normally costs per unit (its catalogue price when it was proposed); the line is
    // charged `unit_price_cents` (never above the original), and the difference is "You save".
    listPriceCents: integer('list_price_cents'),
    // A replacement refused at the door after capture: written in two steps (intent, then the amount
    // once the gateway has answered) so a crash in between can be continued, never repeated.
    refundIntentAt: timestamp('refund_intent_at', { withTimezone: true }),
    refundedCents: integer('refunded_cents').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('order_items_substitutes_item_idx').on(t.substitutesItemId),
    check(
      'order_items_swap_check',
      sql`(${t.substitutesItemId} is null) = (${t.swapStatus} is null)`,
    ),
    check(
      'order_items_picked_check',
      sql`${t.pickedQty} is null or (${t.pickedQty} >= 0 and ${t.pickedQty} <= ${t.quantity})`,
    ),
    check(
      'order_items_refunded_check',
      sql`${t.refundedCents} >= 0 and ${t.refundedCents} <= greatest(${t.lineTotalCents}, coalesce(${t.finalCents}, 0))`,
    ),
    index('order_items_order_id_idx').on(t.orderId),
    index('order_items_variant_id_idx').on(t.variantId),
    check('order_items_quantity_check', sql`${t.quantity} > 0`),
    check('order_items_unit_price_check', sql`${t.unitPriceCents} >= 0`),
    check(
      'order_items_discount_check',
      sql`${t.discountCents} >= 0 AND ${t.discountCents} <= ${t.lineTotalCents}`,
    ),
    check(
      'order_items_line_total_check',
      sql`${t.lineTotalCents} = ${t.unitPriceCents} * ${t.quantity}`,
    ),
  ],
);
