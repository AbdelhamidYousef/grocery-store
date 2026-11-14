import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { carts } from './carts.ts';
import { citext, createdAt, id, updatedAt } from './columns.ts';
import { users } from './users.ts';

export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'awaiting_vet_approval',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);

// Copied into the order at purchase time. Later edits or deletion of the saved address must not
// change what was shipped, so this is a value, not a reference.
export type AddressSnapshot = {
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode: string;
  country: string;
  phone?: string | null;
};

// A sequence never hands out the same number twice, even for concurrent checkouts, and it is
// not rolled back with a failed transaction, so numbers may have gaps but never collide.
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1 });

export const orders = pgTable(
  'orders',
  {
    id: id(),
    // Human-facing number like PW-2026-000123, built by the database so no code path can skip it.
    number: text('number')
      .notNull()
      .unique()
      .default(
        sql`'PW-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0')`,
      ),
    // Null for guest checkout. SET NULL (not cascade) so deleting an account never deletes the
    // shop's sales records.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    // Copied from the user at purchase time, or typed by the guest.
    email: citext('email').notNull(),
    status: orderStatus('status').notNull().default('pending_payment'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    // The store view the order was placed in and its Intl locale (phase 21): snapshots, so emails
    // and documents stay in the language of the purchase even if the store config changes later.
    storeView: text('store_view').notNull().default('eu-en'),
    locale: text('locale').notNull().default('en-IE'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    // The round-up donation (phase 19): a separate amount on top of the goods, never discounted.
    donationCents: integer('donation_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    // Money handed back so far, by a whole-order refund or by refunded returns (phase 22). Analytics
    // reads net revenue as total - refunded, so a partial return needs no guessing from statuses.
    refundedCents: integer('refunded_cents').notNull().default(0),
    // Snapshots of the chosen shipping method: it may be edited or retired later.
    shippingMethodCode: text('shipping_method_code').notNull(),
    shippingMethodName: text('shipping_method_name').notNull(),
    shippingAddress: jsonb('shipping_address').$type<AddressSnapshot>().notNull(),
    // Null means "same as shipping".
    billingAddress: jsonb('billing_address').$type<AddressSnapshot>(),
    notes: text('notes'),
    // Set when payment is confirmed, so it differs from created_at for abandoned checkouts.
    placedAt: timestamp('placed_at', { withTimezone: true }),
    // Provenance only; the cart can be purged without touching the order.
    cartId: uuid('cart_id').references(() => carts.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orders_user_id_idx').on(t.userId),
    index('orders_cart_id_idx').on(t.cartId),
    // Last line of defence: whatever the pricing code does, an order whose parts do not add up
    // can never be stored.
    check(
      'orders_total_check',
      sql`${t.totalCents} = ${t.subtotalCents} + ${t.shippingCents} + ${t.taxCents} + ${t.donationCents} - ${t.discountCents}`,
    ),
    check(
      'orders_refunded_check',
      sql`${t.refundedCents} >= 0 AND ${t.refundedCents} <= ${t.totalCents}`,
    ),
    check(
      'orders_amounts_check',
      sql`${t.subtotalCents} >= 0 AND ${t.shippingCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.taxCents} >= 0 AND ${t.donationCents} >= 0 AND ${t.totalCents} >= 0`,
    ),
  ],
);
