import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryKey } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { products } from './products.ts';

// Curated groups of products. A collection with a window (`starts_at`/`ends_at`) is seasonal and
// only public inside it; one without a window is evergreen. `is_active` is the editor's master
// switch on top of the window.
export const collections = pgTable(
  'collections',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    accentColor: text('accent_color').notNull().default('#8B5CF6'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'collections_window_check',
      sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

// Many-to-many with an order: `position` is the editor's ordering inside this one collection.
export const collectionProducts = pgTable(
  'collection_products',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.productId] }),
    index('collection_products_product_id_idx').on(t.productId),
    check('collection_products_position_check', sql`${t.position} >= 0`),
  ],
);
