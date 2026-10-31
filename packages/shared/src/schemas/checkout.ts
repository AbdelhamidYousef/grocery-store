import { z } from 'zod';

import { DataSchema, optionalText, requiredText } from './common.ts';
import { CountrySchema } from './shipping.ts';

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
});
export type CheckoutRequestInput = z.input<typeof CheckoutRequestSchema>;
export type CheckoutRequest = z.output<typeof CheckoutRequestSchema>;

// ---------- responses ----------

export const OrderTotalsSchema = z.object({
  currency: z.string().length(3),
  subtotalCents: z.number().int().min(0),
  shippingCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
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
  items: z.array(OrderItemSchema),
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

// `PW-2026-000123`: the year plus a zero-padded sequence number.
export const OrderNumberParamsSchema = z.object({
  number: z.string().regex(/^PW-\d{4}-\d{6,}$/, 'Not an order number'),
});
