import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { categories } from './categories.ts';
import { createdAt, id, updatedAt } from './columns.ts';

// The featured tile in a mega-menu panel. `category_id` is the department it belongs to; null means
// "any department": the fallback shown in a
// panel that has no promo of its own. Images are files under apps/web/public (or any URL); the
// alt text is required because the tile's picture carries meaning.
export const menuPromos = pgTable(
  'menu_promos',
  {
    id: id(),
    // CASCADE: a promo for a department that is deleted has nothing left to promote.
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    imageUrl: text('image_url').notNull(),
    imageAlt: text('image_alt').notNull(),
    // A site-relative path ("/collections/summer") or an absolute https URL.
    link: text('link').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('menu_promos_category_idx').on(t.categoryId, t.active, t.sortOrder)],
);
