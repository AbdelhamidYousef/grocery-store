import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { citext, createdAt, id, updatedAt } from './columns.ts';
import { discountCodes } from './promotions.ts';
import { users } from './users.ts';

export const newsletterStatus = pgEnum('newsletter_status', [
  'pending',
  'confirmed',
  'unsubscribed',
]);

// One row per address. `pending` until the subscriber clicks the link in the inbox (double
// opt-in: the click is the proof that the address owner agreed). Only the SHA-256 of the confirm
// token is stored, so a database leak cannot confirm anyone. `unsubscribe_token` is a separate
// long-lived random value that can only unsubscribe, which is why it may sit in every mail.
export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    id: id(),
    email: citext('email').notNull().unique(),
    status: newsletterStatus('status').notNull().default('pending'),
    tokenHash: text('token_hash'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    unsubscribeToken: text('unsubscribe_token').notNull().unique(),
    // Department slugs the subscriber wants news about; empty means everything.
    interests: jsonb('interests').$type<string[]>().notNull().default([]),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    consentText: text('consent_text').notNull(),
    // The store view (and so the language) the person was in; their mail follows it.
    storeView: text('store_view').notNull().default('de-en'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    // The welcome code is minted once per address, ever: re-subscribing finds this and mints none.
    welcomeCodeId: uuid('welcome_code_id').references(() => discountCodes.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('newsletter_subscribers_token_hash_idx').on(t.tokenHash),
    index('newsletter_subscribers_user_id_idx').on(t.userId),
    check(
      'newsletter_confirmed_check',
      sql`${t.status} <> 'confirmed' OR ${t.confirmedAt} IS NOT NULL`,
    ),
  ],
);
