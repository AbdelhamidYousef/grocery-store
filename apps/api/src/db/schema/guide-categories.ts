import { integer, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

// Topics the pet-care guides are filed under ("Dogs", "Cats", "Health"...). Separate from the shop's
// product categories on purpose: a guide about first-week puppy care has no product category, and
// the guide navigation should not change when the catalogue is reorganised.
export const guideCategories = pgTable('guide_categories', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
