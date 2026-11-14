import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { citext, createdAt, id } from './columns.ts';
import { productVariants } from './product-variants.ts';
import { users } from './users.ts';

export const stockAlertStatus = pgEnum('stock_alert_status', ['waiting', 'sent', 'cancelled']);

// "Email me when it is back". `due_at` is set by a trigger on `inventory` (migration 0026) the
// moment available stock goes from 0 to more than 0, whichever code path did it; the hourly job
// `send-stock-alerts` emails the due ones and marks them sent. The token is the cancel link.
export const stockAlerts = pgTable(
  'stock_alerts',
  {
    id: id(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    status: stockAlertStatus('status').notNull().default('waiting'),
    token: text('token').notNull().unique(),
    // The store view (and so the language) the person was in; their mail follows it.
    storeView: text('store_view').notNull().default('de-en'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // One waiting alert per person per variant: asking twice is the same ask.
    uniqueIndex('stock_alerts_waiting_unique')
      .on(t.variantId, t.email)
      .where(sql`${t.status} = 'waiting'`),
    index('stock_alerts_due_idx')
      .on(t.dueAt)
      .where(sql`${t.status} = 'waiting' AND ${t.dueAt} IS NOT NULL`),
    index('stock_alerts_email_idx').on(t.email),
  ],
);
