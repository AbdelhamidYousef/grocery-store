import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

// Theme data for the colourful per-pet look; only top-level categories carry it.
export type CategoryAttributes = { accentColor?: string; icon?: string };

export const categories = pgTable(
  'categories',
  {
    id: id(),
    // Immutable once public: URLs and SEO depend on it.
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    // One level of nesting is enough (Dogs > Toys). Deleting a parent that still has children is
    // refused (no cascade) so a category tree can never vanish by accident.
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    sortOrder: integer('sort_order').notNull().default(0),
    attributes: jsonb('attributes').$type<CategoryAttributes>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('categories_parent_id_idx').on(t.parentId),
    index('categories_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);
