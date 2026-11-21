import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { carts } from './carts.ts';
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
  // Opening hours in the shop's zone (Europe/Berlin), local wall-clock times. Slots are built from
  // them and express delivery is offered only inside them.
  opensAt: time('opens_at').notNull().default('08:00'),
  closesAt: time('closes_at').notNull().default('22:00'),
  // How many orders one delivery slot of this store takes.
  slotCapacity: integer('slot_capacity').notNull().default(8),
  // Express orders the store takes per 30 minutes (one per free rider).
  expressRiders: integer('express_riders').notNull().default(2),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// A one-hour delivery window of a store with a fixed capacity. Whether it is full is never stored:
// it is counted from live holds and booked orders (see the slots module).
export const deliverySlots = pgTable(
  'delivery_slots',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => darkStores.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Also the lookup index for "the slots of a store from time X".
    unique('delivery_slots_store_starts_key').on(t.storeId, t.startsAt),
    check('delivery_slots_capacity_check', sql`${t.capacity} > 0`),
    check('delivery_slots_window_check', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

// A shopper's claim on one place of a slot while they check out. It belongs to the cart (one hold
// per cart) and stops counting by itself at `expires_at`: nothing has to run for that. The
// `release-slot-holds` job only deletes old rows. When the order is placed the hold is deleted and
// the order carries the slot.
export const slotHolds = pgTable(
  'slot_holds',
  {
    id: id(),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => deliverySlots.id, { onDelete: 'cascade' }),
    cartId: uuid('cart_id')
      .notNull()
      .unique()
      .references(() => carts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('slot_holds_slot_expires_idx').on(t.slotId, t.expiresAt)],
);

// A lookup table, not a rule ("10xxx is Mitte"): real areas are not ranges. Seeded, never edited
// in the UI.
export const postcodes = pgTable('postcodes', {
  code: char('code', { length: 5 }).primaryKey(),
  areaId: uuid('area_id')
    .notNull()
    .references(() => deliveryAreas.id, { onDelete: 'cascade' }),
});
