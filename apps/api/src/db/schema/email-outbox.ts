import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { orders } from './orders.ts';

// Emails waiting to be sent. A row is written in the SAME transaction as the status change that
// causes it, so the two exist together or not at all: a crash cannot lose the email (the row is
// still there to send) and a rollback cannot send an email for a change that never happened.
// A separate step sends the rows and stamps `sent_at`.
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: id(),
    // Which template: 'order_confirmation', 'order_shipped', 'withdrawal_ack', 'contact_ack', ...
    // (text, so a new email needs no migration).
    kind: text('kind').notNull(),
    // Null for emails that are not about an order (contact form, safety notices).
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    // What the template needs besides the order (a withdrawal's timestamp, a notice's text).
    // Stored as data, never as rendered HTML, so a template fix still reaches queued emails.
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    // Copied at enqueue time: the address the order was placed with, even if the account changes.
    toEmail: text('to_email').notNull(),
    // `<kind>:<orderId>` for order emails, or `<kind>:<reference>` for the rest. Unique, so replaying a transition (a retried webhook) can never queue a
    // second copy of the same email.
    dedupeKey: text('dedupe_key').notNull(),
    // The store view the email is written for: language, number and date format, link prefix.
    // Taken from the order's snapshot (or the subscriber's) when the email is queued, never from
    // whoever triggers it.
    storeView: text('store_view').notNull().default('de-en'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    // Backoff: a failed send is retried later, not in a tight loop against a dead SMTP server.
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('email_outbox_dedupe_key_idx').on(t.dedupeKey),
    index('email_outbox_order_id_idx').on(t.orderId),
    // The drain query only ever looks at unsent rows, so the index only holds those.
    index('email_outbox_pending_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.sentAt} is null`),
  ],
);
