import { sql } from 'drizzle-orm';
import { char, check, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id, updatedAt } from './columns.ts';
import { orders } from './orders.ts';

export const paymentStatus = pgEnum('payment_status', [
  'requires_payment',
  'processing',
  'succeeded',
  'failed',
  'refunded',
]);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    // One payment row per order. No cascade: payment records are financial history and an order
    // with a payment must not be deletable by accident.
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id),
    provider: text('provider').notNull().default('stripe'),
    // Nullable because the row can exist before the provider call returns; UNIQUE still allows
    // many NULLs, and forbids two payments pointing at the same Stripe intent.
    providerPaymentIntentId: text('provider_payment_intent_id').unique(),
    status: paymentStatus('status').notNull().default('requires_payment'),
    // Must equal the order total; the webhook handler verifies it before marking the order paid.
    amountCents: integer('amount_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('payments_amount_check', sql`${t.amountCents} >= 0`)],
);
