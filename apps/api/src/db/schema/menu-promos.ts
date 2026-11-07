import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { petSpecies } from './pets.ts';

// The featured tile in a mega-menu panel. `pet` null means "any pet": the fallback shown in a
// panel that has no promo of its own. Images are files under apps/web/public (or any URL); the
// alt text is required because the tile's picture carries meaning.
export const menuPromos = pgTable(
  'menu_promos',
  {
    id: id(),
    pet: petSpecies('pet'),
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
  (t) => [index('menu_promos_pet_idx').on(t.pet, t.active, t.sortOrder)],
);
