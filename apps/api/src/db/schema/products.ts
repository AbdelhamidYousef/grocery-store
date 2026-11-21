import type { Nutrition } from '@store/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { brands } from './brands.ts';
import { categories } from './categories.ts';
import { createdAt, id, updatedAt } from './columns.ts';

export const productStatus = pgEnum('product_status', ['draft', 'active', 'archived']);

// A bundle (kit) is a product whose variant is made of other variants (bundle_items).
export const productKind = pgEnum('product_kind', ['simple', 'bundle']);

// Niche-specific facts live in jsonb so the table does not change when the shop sells something
// else. `optionKeys` is the ordered option schema the product page builds its picker from.
export type ProductAttributes = {
  /** How it is kept: a facet on the product list. */
  storage?: 'ambient' | 'chilled' | 'frozen';
  /** Country (or region) the product comes from: a facet on the product list. */
  origin?: string;
  size?: string;
  optionKeys?: string[];
  // Read by later phases (weighing, best-before dates, bottle deposit); G3 only stores them.
  soldByWeight?: boolean;
  shelfLifeDays?: number;
  deposit?: boolean;
};

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const products = pgTable(
  'products',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    status: productStatus('status').notNull().default('draft'),
    // Normalised (not jsonb) so brands get pages, a story and an admin. SET NULL: deleting a
    // brand must never delete its products.
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    // Editorial flags. Badges such as New/Low stock/Sale are *derived* from data we already hold;
    // only these genuinely manual signals are stored.
    isBestsellerOverride: boolean('is_bestseller_override').notNull().default(false),
    isEco: boolean('is_eco').notNull().default(false),
    badgeNewUntil: timestamp('badge_new_until', { withTimezone: true }),
    kind: productKind('kind').notNull().default('simple'),
    // Shown in the Delivery & returns tab next to the shared policy copy ("ships in its own box").
    deliveryNote: text('delivery_note'),
    // Which size chart the product page opens; SET NULL so deleting a guide never deletes products.
    // Denormalised review aggregate, kept in step with moderation in the same transaction (so a
    // card never runs AVG() over reviews). Average = rating_sum / rating_count.
    ratingCount: integer('rating_count').notNull().default(0),
    ratingSum: integer('rating_sum').notNull().default(0),
    // Days a fresh pack lasts; null for non-food (household goods are restocked on return, food is not).
    shelfLifeDays: integer('shelf_life_days'),
    attributes: jsonb('attributes').$type<ProductAttributes>().notNull().default({}),
    // Food information (null / empty for a product that is not food). Nutrition is per 100 g or
    // 100 ml, every nutrient an integer count of tenths of a gram (see shared/food.ts).
    nutrition: jsonb('nutrition').$type<Nutrition>(),
    // Allergens are written in capitals inside the text ("WHEAT flour"); the page prints them bold.
    ingredients: text('ingredients'),
    // Subsets of the shared ALLERGEN_SLUGS / DIETARY_SLUGS constants (checked at the edges by Zod).
    allergens: text('allergens')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    dietary: text('dietary')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Computed by Postgres on every write, so it can never drift from name/description and the
    // app never has to remember to maintain it. Name and description are both NOT NULL, so plain
    // concatenation is safe.
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('english', name || ' ' || description)`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('products_rating_check', sql`${t.ratingCount} >= 0 AND ${t.ratingSum} >= 0`),
    index('products_category_id_idx').on(t.categoryId),
    index('products_brand_id_idx').on(t.brandId),
    index('products_search_vector_idx').using('gin', t.searchVector),
    index('products_attributes_idx').using('gin', t.attributes),
    // `dietary @> '{vegan}'` for the diet filter.
    index('products_dietary_idx').using('gin', t.dietary),
    // Typo-tolerant and substring search on the name for the autocomplete (needs pg_trgm, created
    // in the migration just before this index).
    index('products_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);
