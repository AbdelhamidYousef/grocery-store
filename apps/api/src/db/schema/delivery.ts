import { boolean, char, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

// A delivery area is a district we ship to; a dark store is the small warehouse (no walk-in
// shoppers) that packs its orders. One store per area, so the postcode decides the shelf.
export const deliveryAreas = pgTable('delivery_areas', {
  id: id(),
  slug: text('slug').notNull().unique(),
  // Berlin district names, the same in every language, so no translation table.
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const darkStores = pgTable('dark_stores', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  street: text('street').notNull(),
  postalCode: char('postal_code', { length: 5 }).notNull(),
  // Unique: one store per area.
  areaId: uuid('area_id')
    .notNull()
    .unique()
    .references(() => deliveryAreas.id, { onDelete: 'restrict' }),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// A lookup table, not a rule ("10xxx is Mitte"): real areas are not ranges. Seeded, never edited
// in the UI.
export const postcodes = pgTable('postcodes', {
  code: char('code', { length: 5 }).primaryKey(),
  areaId: uuid('area_id')
    .notNull()
    .references(() => deliveryAreas.id, { onDelete: 'cascade' }),
});
