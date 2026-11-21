import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { citext, createdAt, id, updatedAt } from './columns.ts';
import { orders } from './orders.ts';
import { productVariants } from './product-variants.ts';
import { users } from './users.ts';

// All promotion maths lives in the pure engine (packages/shared/src/pricing). These tables only
// hold the rules it is fed and the snapshot of what it decided for each order.

export const discountKind = pgEnum('discount_kind', ['percent', 'fixed', 'free_shipping']);

export const discountCodes = pgTable(
  'discount_codes',
  {
    id: id(),
    // citext: "grocery10" and "GROCERY10" are the same code, for lookup and for the unique index.
    code: citext('code').notNull().unique(),
    kind: discountKind('kind').notNull(),
    // percent: whole percent 1..100. fixed: cents. free_shipping: 0.
    value: integer('value').notNull().default(0),
    minSpendCents: integer('min_spend_cents').notNull().default(0),
    // Amounts in currencies other than EUR (the columns above are EUR): `{"GBP": 500}`. A fixed
    // code with no entry for a currency does not exist there; neither does a code whose EUR
    // minimum spend is above 0 but has no entry. Nothing is converted.
    valueByCurrency: jsonb('value_by_currency')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    minSpendByCurrency: jsonb('min_spend_by_currency')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // null = unlimited
    maxUses: integer('max_uses'),
    perCustomerMax: integer('per_customer_max'),
    excludeSaleItems: boolean('exclude_sale_items').notNull().default(false),
    firstOrderOnly: boolean('first_order_only').notNull().default(false),
    // A personal code (referrals, phase 19). SET NULL: deleting the account keeps sales history.
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    active: boolean('active').notNull().default(true),
    // A code with redemptions is archived, never deleted, so old orders keep their reference.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'discount_codes_value_check',
      sql`(${t.kind} = 'percent' AND ${t.value} BETWEEN 1 AND 100)
        OR (${t.kind} = 'fixed' AND ${t.value} > 0)
        OR (${t.kind} = 'free_shipping' AND ${t.value} = 0)`,
    ),
    check('discount_codes_min_spend_check', sql`${t.minSpendCents} >= 0`),
    check(
      'discount_codes_window_check',
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
    check('discount_codes_max_uses_check', sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`),
    check(
      'discount_codes_per_customer_check',
      sql`${t.perCustomerMax} IS NULL OR ${t.perCustomerMax} > 0`,
    ),
  ],
);

// One row per order that used a code. Reserved when the order is created; released (not deleted)
// when that order's payment fails or the reservation expires, so caps only count live rows.
// A paid order that is later cancelled keeps its row: the code was consumed.
export const discountRedemptions = pgTable(
  'discount_redemptions',
  {
    id: id(),
    codeId: uuid('code_id')
      .notNull()
      .references(() => discountCodes.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // The user id, or the lowercased email for a guest (same rule as trial_redemptions).
    customerKey: text('customer_key').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('discount_redemptions_code_order_unique').on(t.codeId, t.orderId),
    index('discount_redemptions_customer_idx')
      .on(t.codeId, t.customerKey)
      .where(sql`${t.releasedAt} IS NULL`),
    index('discount_redemptions_order_id_idx').on(t.orderId),
  ],
);

export const bulkTiers = pgTable(
  'bulk_tiers',
  {
    id: id(),
    // Two tiers on the same threshold would be ambiguous.
    minCents: integer('min_cents').notNull().unique(),
    // Thresholds in other currencies; a tier with no entry for a currency does not apply there.
    minByCurrency: jsonb('min_by_currency').$type<Record<string, number>>().notNull().default({}),
    percent: integer('percent').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('bulk_tiers_min_cents_check', sql`${t.minCents} > 0`),
    check('bulk_tiers_percent_check', sql`${t.percent} BETWEEN 1 AND 100`),
  ],
);

export const giftRules = pgTable(
  'gift_rules',
  {
    id: id(),
    thresholdCents: integer('threshold_cents').notNull(),
    // Thresholds in other currencies; no entry for a currency means no gift there.
    thresholdByCurrency: jsonb('threshold_by_currency')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    // RESTRICT: the gift product cannot be deleted while a rule points at it.
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('gift_rules_threshold_check', sql`${t.thresholdCents} > 0`),
    // The engine takes one gift rule, so at most one may be active.
    uniqueIndex('gift_rules_one_active_idx')
      .on(t.active)
      .where(sql`${t.active}`),
  ],
);

export const flashSaleStatus = pgEnum('flash_sale_status', ['scheduled', 'active', 'ended']);

export const flashSales = pgTable(
  'flash_sales',
  {
    id: id(),
    name: text('name').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: flashSaleStatus('status').notNull().default('scheduled'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('flash_sales_window_check', sql`${t.endsAt} > ${t.startsAt}`),
    index('flash_sales_status_window_idx').on(t.status, t.startsAt, t.endsAt),
  ],
);

export const flashSaleItems = pgTable(
  'flash_sale_items',
  {
    id: id(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => flashSales.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    salePriceCents: integer('sale_price_cents').notNull(),
    // EU Omnibus: the lowest price in the 30 days before the sale started, fixed when the sale
    // activates. Null until then, or when there is no history (then no strike-through is shown).
    referenceCents: integer('reference_cents'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('flash_sale_items_sale_variant_unique').on(t.saleId, t.variantId),
    index('flash_sale_items_variant_id_idx').on(t.variantId),
    check('flash_sale_items_price_check', sql`${t.salePriceCents} > 0`),
    check(
      'flash_sale_items_reference_check',
      sql`${t.referenceCents} IS NULL OR ${t.referenceCents} > 0`,
    ),
  ],
);

export const priceKind = pgEnum('price_kind', ['base', 'sale', 'member']);

// Append-only: every price a variant has been offered at, and from when. Rows are never updated
// or deleted by the app; the Omnibus reference price is a MIN over a window of these rows.
export const priceHistory = pgTable(
  'price_history',
  {
    id: id(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    priceCents: integer('price_cents').notNull(),
    kind: priceKind('kind').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index('price_history_variant_valid_from_idx').on(t.variantId, t.validFrom),
    check('price_history_price_check', sql`${t.priceCents} >= 0`),
  ],
);

export const orderPromotionType = pgEnum('order_promotion_type', [
  'bulk_tier',
  'code',
  'free_shipping',
  'credit',
  'gift',
]);

// What the engine decided for an order, copied as values: editing or deleting a code later must
// not change what an old order says it saved.
export const orderPromotions = pgTable(
  'order_promotions',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: orderPromotionType('type').notNull(),
    // The rule's id at the time (code, tier, gift rule, credit); text, not a foreign key, on purpose.
    refId: text('ref_id').notNull(),
    label: text('label').notNull(),
    cents: integer('cents').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_promotions_order_id_idx').on(t.orderId),
    check('order_promotions_cents_check', sql`${t.cents} >= 0`),
  ],
);
