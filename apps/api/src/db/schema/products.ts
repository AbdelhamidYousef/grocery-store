import type { Pet } from '@store/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
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

// Niche-specific facts live in jsonb so the table does not change when the shop sells something
// else. `optionKeys` is the ordered option schema the product page builds its picker from.
export type ProductAttributes = {
  pet?: Pet;
  material?: string;
  ageStage?: 'puppy' | 'kitten' | 'adult' | 'senior' | 'all';
  size?: string;
  optionKeys?: string[];
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
    attributes: jsonb('attributes').$type<ProductAttributes>().notNull().default({}),
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
    index('products_category_id_idx').on(t.categoryId),
    index('products_brand_id_idx').on(t.brandId),
    index('products_search_vector_idx').using('gin', t.searchVector),
    index('products_attributes_idx').using('gin', t.attributes),
  ],
);
