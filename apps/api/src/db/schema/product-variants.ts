import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { productStatus, products } from './products.ts';

// Net contents unit: grams or millilitres, the base small unit, so amounts are integers.
export const netUnit = pgEnum('net_unit', ['g', 'ml']);

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
    // Price for signed-in customers (phase 18). Null = none. The engine picks the lowest of base,
    // member and an active flash-sale price; prices never stack.
    memberPriceCents: integer('member_price_cents'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    weightGrams: integer('weight_grams').notNull(),
    // What is inside, in grams or ml; null for items with no meaningful net amount (a toy).
    // Drives the unit price (per kg / per L) computed in packages/shared.
    netAmount: integer('net_amount'),
    netUnit: netUnit('net_unit'),
    // Sold by weight (loose fruit, counter cheese, fish): the shopper buys "about nominal_grams", the
    // card is authorised for an estimate and charged for what the bag weighs. `price_cents` stays the
    // estimate of one nominal unit (derived from the price per kg, see shared/weight.ts), so every
    // reader of prices keeps working; these columns say how it was derived.
    soldByWeight: boolean('sold_by_weight').notNull().default(false),
    pricePerKgCents: integer('price_per_kg_cents'),
    nominalGrams: integer('nominal_grams'),
    // Bottle deposit per unit, in cents (0.25 EUR or 0.08 EUR; 0 for most things). Its own line on the
    // bill: not goods, so never discounted and not counted by the minimum or free delivery (G9).
    depositCents: integer('deposit_cents').notNull().default(0),
    // A sample size; at most one unit per customer, ever (trial_redemptions).
    isTrial: boolean('is_trial').notNull().default(false),
    // Colour dot shown on the product card, #RRGGBB.
    swatchHex: text('swatch_hex'),
    isDefault: boolean('is_default').notNull().default(false),
    status: productStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('product_variants_price_cents_check', sql`${t.priceCents} >= 0`),
    check(
      'product_variants_member_price_check',
      sql`${t.memberPriceCents} is null or ${t.memberPriceCents} > 0`,
    ),
    // A weighed variant needs both numbers; any other must have neither.
    check(
      'product_variants_weight_check',
      sql`(${t.soldByWeight} and ${t.pricePerKgCents} is not null and ${t.pricePerKgCents} > 0 and ${t.nominalGrams} is not null and ${t.nominalGrams} > 0) or (not ${t.soldByWeight} and ${t.pricePerKgCents} is null and ${t.nominalGrams} is null)`,
    ),
    check('product_variants_deposit_check', sql`${t.depositCents} >= 0`),
    check('product_variants_net_amount_check', sql`${t.netAmount} is null or ${t.netAmount} > 0`),
    // An amount without a unit (or the reverse) is meaningless.
    check(
      'product_variants_net_pair_check',
      sql`(${t.netAmount} is null) = (${t.netUnit} is null)`,
    ),
    check(
      'product_variants_swatch_hex_check',
      sql`${t.swatchHex} is null or ${t.swatchHex} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
    // Also serves as the index on product_id (it is the leading column).
    uniqueIndex('product_variants_product_options_idx').on(t.productId, t.options),
    uniqueIndex('product_variants_one_default_idx')
      .on(t.productId)
      .where(sql`${t.isDefault}`),
  ],
);
