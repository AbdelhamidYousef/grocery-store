import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';
import { orders } from './orders.ts';
import { products } from './products.ts';
import { users } from './users.ts';

// pending -> approved | rejected (and approved <-> rejected by an admin changing their mind).
// Public queries only ever select 'approved'.
export const reviewStatus = pgEnum('review_status', ['pending', 'approved', 'rejected']);

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // SET NULL, not cascade: deleting an account keeps the review text (shown as "a Grocery
    // customer") so the product's rating does not silently change.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    // The paid order that made this a verified purchase; null for unverified reviews.
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    rating: smallint('rating').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Computed by the server from a paid order, never accepted from the client.
    verifiedBuyer: boolean('verified_buyer').notNull().default(false),
    sizePurchased: text('size_purchased'),
    wouldRecommend: boolean('would_recommend').notNull(),
    status: reviewStatus('status').notNull().default('pending'),
    rejectReason: text('reject_reason'),
    helpfulCount: integer('helpful_count').notNull().default(0),
    createdAt: createdAt(),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  },
  (t) => [
    // One review per customer per product. A NULL user_id (deleted account) never collides.
    unique('reviews_user_product_unique').on(t.userId, t.productId),
    index('reviews_product_status_created_idx').on(t.productId, t.status, t.createdAt),
    index('reviews_status_created_idx').on(t.status, t.createdAt),
    check('reviews_rating_check', sql`${t.rating} between 1 and 5`),
    check('reviews_helpful_check', sql`${t.helpfulCount} >= 0`),
  ],
);

export const reviewPhotos = pgTable(
  'review_photos',
  {
    id: id(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    // Web path ("/uploads/reviews/<uuid>.webp" or a committed "/reviews/..." seed photo).
    path: text('path').notNull(),
    position: smallint('position').notNull().default(0),
  },
  (t) => [index('review_photos_review_idx').on(t.reviewId, t.position)],
);

export const reviewVotes = pgTable(
  'review_votes',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId] })],
);
