import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { guideCategories } from './guide-categories.ts';
import { products } from './products.ts';

// Shared by guides and help articles: a draft is visible to the admin only.
export const contentStatus = pgEnum('content_status', ['draft', 'published']);

// Authored as Markdown files in apps/api/content/ and seeded here, so the text can also be edited
// in the admin, linked to products and queried, which a folder of files cannot do.
export const guides = pgTable(
  'guides',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    // Markdown source, never HTML: the web renders it without raw HTML (see MarkdownBody).
    bodyMd: text('body_md').notNull(),
    // RESTRICT: deleting a category that still has guides must be a deliberate act.
    categoryId: uuid('category_id')
      .notNull()
      .references(() => guideCategories.id, { onDelete: 'restrict' }),
    coverUrl: text('cover_url'),
    status: contentStatus('status').notNull().default('published'),
    // Null for a draft that was never published.
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('guides_category_id_idx').on(t.categoryId),
    // The list is "published, newest first": one index serves the filter and the order.
    index('guides_published_at_idx').on(t.status, t.publishedAt),
  ],
);

// Which products a guide recommends. The composite key doubles as the "no duplicates" rule, and
// both sides cascade: a link means nothing once either end is gone.
export const guideProducts = pgTable(
  'guide_products',
  {
    guideId: uuid('guide_id')
      .notNull()
      .references(() => guides.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.guideId, t.productId] }),
    index('guide_products_product_id_idx').on(t.productId),
  ],
);
