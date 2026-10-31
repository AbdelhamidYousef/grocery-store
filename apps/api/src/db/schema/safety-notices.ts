import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { citext, createdAt, id, updatedAt } from './columns.ts';
import { contentStatus } from './guides.ts';
import { productVariants } from './product-variants.ts';

export const safetySeverity = pgEnum('safety_severity', ['info', 'warning', 'recall']);

// A warning or recall about specific product variants. Shown on the homepage and on the affected
// product pages while it is active, and (for a recall) emailed to people who bought the variants.
export const safetyNotices = pgTable(
  'safety_notices',
  {
    id: id(),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    severity: safetySeverity('severity').notNull().default('info'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    // Null means "until an admin ends it".
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // A draft is invisible to the public whatever its dates say.
    status: contentStatus('status').notNull().default('published'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('safety_notices_dates_check', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  ],
);

// Which variants a notice covers. Variant, not product: a recall is often one size or one batch.
export const safetyNoticeVariants = pgTable(
  'safety_notice_variants',
  {
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => safetyNotices.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.noticeId, t.variantId] }),
    index('safety_notice_variants_variant_id_idx').on(t.variantId),
  ],
);

// One row per notice and customer email once they were emailed. The unique pair is the whole
// idempotency: asking to notify again can only insert the emails that are not there yet.
export const safetyNoticeDeliveries = pgTable(
  'safety_notice_deliveries',
  {
    id: id(),
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => safetyNotices.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('safety_notice_deliveries_notice_email_idx').on(t.noticeId, t.email)],
);
