import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';

// Fictional quotes for the demo storefront, edited in the admin. Not product reviews: those are
// per product and come from buyers (a later phase).
export const testimonials = pgTable(
  'testimonials',
  {
    id: id(),
    name: text('name').notNull(),
    // Where the customer lives (a Berlin district); shown under the name.
    area: text('area').notNull().default('Berlin'),
    rating: integer('rating').notNull(),
    quote: text('quote').notNull(),
    isFeatured: boolean('is_featured').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('testimonials_rating_check', sql`${t.rating} between 1 and 5`)],
);
