import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

export const shippingMethods = pgTable('shipping_methods', {
  id: id(),
  // Stable identifier ('standard', 'express'); orders snapshot it, so it is never renamed.
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  baseCents: integer('base_cents').notNull(),
  // Weight component: cents per started kilogram of the cart.
  perKgCents: integer('per_kg_cents').notNull().default(0),
  // Subtotal at or above which shipping is free; null = never free.
  freeOverCents: integer('free_over_cents'),
  etaDaysMin: integer('eta_days_min').notNull(),
  etaDaysMax: integer('eta_days_max').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
