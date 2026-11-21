import { z } from 'zod';

import { PickStatusSchema, SwapStatusSchema } from '../substitutions.ts';

import { DataSchema, optionalText, requiredText } from './common.ts';
import { CountrySchema } from './shipping.ts';
import { OrderDeliverySchema } from './slots.ts';

// ---------- statuses ----------

// Mirrors the `order_status` enum in the database (the state machine is phase 9).
export const OrderStatusSchema = z.enum([
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// Mirrors the `payment_status` enum.
export const PaymentStatusSchema = z.enum([
  'requires_payment',
  'processing',
  // The card is held for the authorised amount; the money is taken after packing (manual capture).
  'authorized',
  'succeeded',
  'failed',
  'refunded',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ---------- request ----------

// What the shopper types at checkout. Named `Checkout...` because `AddressSchema` is already the
// saved-address resource (with an id and default flags) in account.ts.
export const CheckoutAddressSchema = z.object({
  fullName: requiredText(120),
  line1: requiredText(160),
  line2: optionalText(160),
  city: requiredText(100),
  region: optionalText(100),
  postalCode: requiredText(20),
  country: CountrySchema,
  phone: optionalText(30),
});
export type CheckoutAddressInput = z.input<typeof CheckoutAddressSchema>;
export type CheckoutAddress = z.output<typeof CheckoutAddressSchema>;

// Deliberately has no prices, totals or cart id: the server prices the caller's own cart. A client
// that sent an amount would only be offering to be lied to.
export const CheckoutRequestSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  shippingAddress: CheckoutAddressSchema,
  // Omitted means "same as shipping".
  billingAddress: CheckoutAddressSchema.optional(),
  shippingMethodCode: z.string().trim().min(1).max(40),
  notes: optionalText(500),
  // Loyalty points to pay part of the merchandise with (1 point = 1 cent). Signed-in only; the
  // server checks the balance under a lock and caps it at what is left of the merchandise.
  pointsToRedeem: z.number().int().min(0).max(10_000_000).optional(),
  // Round the total up to the next whole euro for the shelter (a separate line, demo: no money
  // moves to a real charity).
  roundUpDonation: z.boolean().optional(),
});
export type CheckoutRequestInput = z.input<typeof CheckoutRequestSchema>;
export type CheckoutRequest = z.output<typeof CheckoutRequestSchema>;

// ---------- responses ----------

export const OrderTotalsSchema = z.object({
  currency: z.string().length(3),
  subtotalCents: z.number().int().min(0),
  shippingCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
  // The round-up donation, included in `totalCents`; 0 unless the shopper chose it.
  donationCents: z.number().int().min(0),
  // Always 0 for now (tax is out of scope); the field exists so the UI will not change later.
  taxCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
});
export type OrderTotals = z.infer<typeof OrderTotalsSchema>;

export const CheckoutResponseSchema = DataSchema(
  z.object({
    orderNumber: z.string(),
    // Hands the browser the right to confirm exactly this payment with Stripe.js.
    clientSecret: z.string(),
    // What will be charged, computed by the server; the UI shows these and never adds up itself.
    totals: OrderTotalsSchema,
  }),
);
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

// Orders keep whatever address was typed at the time, so the output is loose (any country code):
// shrinking the allow-list later must not make old orders unreadable.
export const OrderAddressSchema = z.object({
  fullName: z.string(),
  line1: z.string(),
  line2: z.string().nullish(),
  city: z.string(),
  region: z.string().nullish(),
  postalCode: z.string(),
  country: z.string(),
  phone: z.string().nullish(),
});
export type OrderAddress = z.infer<typeof OrderAddressSchema>;

export const OrderItemSchema = z.object({
  id: z.string(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  unitPriceCents: z.number().int().min(0),
  quantity: z.number().int().min(1),
  lineTotalCents: z.number().int().min(0),
  // Sold by weight: the price per kg it was ordered at (null for any other line), the grams once
  // packed and the real price of those grams. `lineTotalCents` stays the estimate it was priced at.
  pricePerKgCents: z.number().int().nullable(),
  weighedGrams: z.number().int().nullable(),
  finalCents: z.number().int().nullable(),
  shortDated: z.boolean(),
  // Packing (G7): what was found, and for a replacement line which line it replaces and whether the
  // shopper took it. `refundedCents` is what a refused replacement gave back after capture.
  pickStatus: PickStatusSchema,
  pickedQty: z.number().int().min(0).nullable(),
  substitutesItemId: z.string().nullable(),
  swapStatus: SwapStatusSchema.nullable(),
  // A replacement's normal unit price (it is charged `unitPriceCents`, never above the original's).
  listPriceCents: z.number().int().min(0).nullable(),
  refundedCents: z.number().int().min(0),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderSchema = z.object({
  number: z.string(),
  status: OrderStatusSchema,
  paymentStatus: PaymentStatusSchema.nullable(),
  email: z.string(),
  totals: OrderTotalsSchema,
  shippingMethod: z.object({ code: z.string(), name: z.string() }),
  shippingAddress: OrderAddressSchema,
  // Null means "same as shipping".
  billingAddress: OrderAddressSchema.nullable(),
  notes: z.string().nullable(),
  // Manual capture: what the card was held for, and what was really taken (null until it was).
  // Both null for orders paid before manual capture existed.
  authorizedCents: z.number().int().nullable(),
  capturedCents: z.number().int().nullable(),
  // Money handed back so far (a refused replacement, a refunded return).
  refundedCents: z.number().int().min(0),
  items: z.array(OrderItemSchema),
  // The promised delivery window; null for orders placed before slots existed.
  delivery: OrderDeliverySchema.nullable(),
  // The back of the shop (G8): when the bag was closed, handed to the (simulated) rider and arrived.
  packedAt: z.string().nullable(),
  dispatch: z
    .object({
      riderName: z.string(),
      dispatchedAt: z.string(),
      deliveredAt: z.string().nullable(),
    })
    .nullable(),
  placedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderResponseSchema = DataSchema(OrderSchema);

// Polled by the confirmation page until the webhook flips the order to `paid`.
export const OrderStatusResponseSchema = DataSchema(
  z.object({ status: OrderStatusSchema, paymentStatus: PaymentStatusSchema.nullable() }),
);
export type OrderStatusResponse = z.infer<typeof OrderStatusResponseSchema>;

// `GR-2026-000123` (orders before G4 keep `PW-`): the year plus a zero-padded sequence number.
export const OrderNumberParamsSchema = z.object({
  number: z.string().regex(/^(GR|PW)-\d{4}-\d{6,}$/, 'Not an order number'),
});
