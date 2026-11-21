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
import { darkStores, deliverySlots } from './delivery.ts';
import { users } from './users.ts';

export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
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
    // Human-facing number like GR-2026-000123, built by the database so no code path can skip it.
    number: text('number')
      .notNull()
      .unique()
      .default(
        sql`'GR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0')`,
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
    storeView: text('store_view').notNull().default('de-en'),
    locale: text('locale').notNull().default('en-IE'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    // The round-up donation (phase 19): a separate amount on top of the goods, never discounted.
    donationCents: integer('donation_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    // What the card was authorised for at checkout: the total at the estimate plus the buffer on
    // weighed lines (shared/weight.ts). Null for orders paid before manual capture (charged in full
    // at once). The capture can be lower than this, never higher.
    authorizedCents: integer('authorized_cents'),
    // What was really taken, once (null until captured; also null for the automatic-capture orders).
    capturedCents: integer('captured_cents'),
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
    // The dark store that packs the order, from the delivery address's postcode at checkout. Stock
    // is reserved, released, committed and restocked against it. Backfilled to Mitte for orders
    // from before G4 (they were all packed from the one warehouse).
    darkStoreId: uuid('dark_store_id').references(() => darkStores.id, { onDelete: 'restrict' }),
    cartId: uuid('cart_id').references(() => carts.id, { onDelete: 'set null' }),
    // How the bag was promised (null for orders from before G5): a one-hour slot or express. The
    // slot id links to the capacity count; the window is a snapshot, so a deleted slot never loses
    // what the shopper was told.
    deliveryKind: text('delivery_kind', { enum: ['slot', 'express'] }),
    slotId: uuid('slot_id').references(() => deliverySlots.id, { onDelete: 'set null' }),
    deliveryFrom: timestamp('delivery_from', { withTimezone: true }),
    deliveryTo: timestamp('delivery_to', { withTimezone: true }),
    // The back of the shop (G8): the bag is closed (`packed_at`), handed to the (simulated) rider
    // (`dispatched_at`, `rider_name`) and arrives once the simulated ride is over (`delivered_at`).
    packedAt: timestamp('packed_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    riderName: text('rider_name'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orders_user_id_idx').on(t.userId),
    index('orders_cart_id_idx').on(t.cartId),
    // The capacity count: orders per slot, and express orders per store over the last minutes.
    index('orders_slot_id_idx').on(t.slotId),
    index('orders_store_kind_created_idx').on(t.darkStoreId, t.deliveryKind, t.createdAt),
    // Last line of defence: whatever the pricing code does, an order whose parts do not add up
    // can never be stored.
    check(
      'orders_total_check',
      sql`${t.totalCents} = ${t.subtotalCents} + ${t.shippingCents} + ${t.taxCents} + ${t.donationCents} - ${t.discountCents}`,
    ),
    check(
      'orders_delivery_kind_check',
      sql`${t.deliveryKind} is null or ${t.deliveryKind} in ('slot', 'express')`,
    ),
    // The money taken can never exceed what the card was authorised for (the services refuse earlier;
    // this is the last line of defence).
    check(
      'orders_capture_check',
      sql`${t.capturedCents} is null or (${t.capturedCents} >= 0 and ${t.authorizedCents} is not null and ${t.capturedCents} <= ${t.authorizedCents})`,
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
