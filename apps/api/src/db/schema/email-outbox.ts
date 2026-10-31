import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    // Which template: 'order_confirmation' | 'order_shipped' (text, so a new email needs no migration).
    kind: text('kind').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Copied at enqueue time: the address the order was placed with, even if the account changes.
    toEmail: text('to_email').notNull(),
    // `<kind>:<orderId>`. Unique, so replaying a transition (a retried webhook) can never queue a
    // second copy of the same email.
    dedupeKey: text('dedupe_key').notNull(),
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
