import { index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { products } from './products.ts';

// Health-need tags ("joints", "dental"): a tag table rather than jsonb so a shopper can combine
// them, counts are one join, and the admin can rename a tag without touching every product.
export const tags = pgTable('tags', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const productTags = pgTable(
  'product_tags',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.tagId] }),
    index('product_tags_tag_id_idx').on(t.tagId),
  ],
);
