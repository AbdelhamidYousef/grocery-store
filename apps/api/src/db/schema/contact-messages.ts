import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { citext, createdAt, id } from './columns.ts';

// A message from the public contact form. Kept in the database (not only emailed) so the admin has
// a queue to work through and mail trouble can never lose a customer's message.
export const contactMessages = pgTable(
  'contact_messages',
  {
    id: id(),
    name: text('name').notNull(),
    email: citext('email').notNull(),
    // One of CONTACT_TOPICS (text, so adding a topic needs no migration).
    topic: text('topic').notNull(),
    // What the visitor typed; not a foreign key, because it is unverified and may be wrong.
    orderNumber: text('order_number'),
    message: text('message').notNull(),
    createdAt: createdAt(),
    // Null until an admin marks it handled.
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [index('contact_messages_handled_idx').on(t.handledAt, t.createdAt)],
);
