import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { productVariants } from './product-variants.ts';
import { products } from './products.ts';

// Structured product-page content (phase 16). Everything a calculator or a table needs is a real
// column with an integer unit (basis points, grams), never free text or a float, so the maths is
// testable and an admin form cannot store "about a quarter".

// Guaranteed analysis per 100 g, as basis points (protein 2650 = 26.50 %), plus energy as plain
// kcal per 100 g. A fixed key list (check constraint, same list as CONSTITUENT_KEYS in packages/shared) keeps the table a table, not a bag of text.
export const variantConstituents = pgTable(
  'variant_constituents',
  {
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    // Basis points for the five percentages; kcal per 100 g for `kcal` (the key says which).
    valueBp: integer('value_bp').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.key] }),
    check(
      'variant_constituents_key_check',
      sql`${t.key} in ('protein', 'fat', 'fibre', 'ash', 'moisture', 'kcal')`,
    ),
    // A percentage cannot pass 100.00 % (10000 bp); energy is capped at a sane 9000 kcal per 100 g.
    check(
      'variant_constituents_value_check',
      sql`${t.valueBp} >= 0 and ${t.valueBp} <= case when ${t.key} = 'kcal' then 9000 else 10000 end`,
    ),
  ],
);

// Static, admin-written Q&A. It replaces a public Q&A feature: no moderation, spam or personal data.
export const productFaqs = pgTable(
  'product_faqs',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('product_faqs_product_idx').on(t.productId, t.sortOrder)],
);

export const productSpecs = pgTable(
  'product_specs',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    value: text('value').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('product_specs_product_idx').on(t.productId, t.sortOrder),
    uniqueIndex('product_specs_label_idx').on(t.productId, t.label),
  ],
);

export const lifeStage = pgEnum('life_stage', ['puppy', 'adult', 'senior', 'any']);

// Daily amount for a pet weight band. A band covers min <= weight < max (half-open), so the next
// band starts exactly where this one ends: no overlap and no gap (checked in packages/shared and
// by the admin form).
export const feedingRows = pgTable(
  'feeding_rows',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    petWeightGMin: integer('pet_weight_g_min').notNull(),
    petWeightGMax: integer('pet_weight_g_max').notNull(),
    dailyG: integer('daily_g').notNull(),
    lifeStage: lifeStage('life_stage').notNull().default('any'),
  },
  (t) => [
    check(
      'feeding_rows_band_check',
      sql`${t.petWeightGMin} >= 0 and ${t.petWeightGMax} > ${t.petWeightGMin}`,
    ),
    check('feeding_rows_daily_check', sql`${t.dailyG} > 0`),
    index('feeding_rows_product_idx').on(t.productId, t.lifeStage, t.petWeightGMin),
  ],
);

export const relationKind = pgEnum('relation_kind', ['bought_together', 'related']);

// Editor-chosen recommendations. When a product has none, the API falls back to co-purchase counts
// and then to the same category or brand (step 16.6).
export const productRelations = pgTable(
  'product_relations',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    relatedId: uuid('related_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    kind: relationKind('kind').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.relatedId, t.kind] }),
    check('product_relations_self_check', sql`${t.productId} <> ${t.relatedId}`),
    index('product_relations_related_idx').on(t.relatedId),
  ],
);

// A bundle is a normal product + variant (products.kind = 'bundle'); this table says what is in it.
// The bundle's price is its variant's price_cents, and its stock is never stored: it is derived
// from the components, so it cannot drift. RESTRICT on the component: deleting a variant that a kit
// is made of would silently change the kit.
export const bundleItems = pgTable(
  'bundle_items',
  {
    bundleVariantId: uuid('bundle_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    componentVariantId: uuid('component_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    qty: integer('qty').notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.bundleVariantId, t.componentVariantId] }),
    check('bundle_items_qty_check', sql`${t.qty} >= 1 and ${t.qty} <= 20`),
    check('bundle_items_self_check', sql`${t.bundleVariantId} <> ${t.componentVariantId}`),
    index('bundle_items_component_idx').on(t.componentVariantId),
  ],
);
