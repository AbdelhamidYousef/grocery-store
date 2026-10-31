import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const webhookEvents = pgTable('webhook_events', {
  // The provider's own event id (Stripe `evt_...`). Using it as the primary key makes "have I
  // seen this event?" an insert that either succeeds or conflicts: natural idempotency.
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  // Null = received but not processed yet (or processing failed; see `error`).
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
