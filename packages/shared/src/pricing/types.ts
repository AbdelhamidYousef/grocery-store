import { z } from 'zod';

// Everything here is integer cents in ONE currency. The engine never converts currencies: the
// service supplies inputs already priced in `currency` (phase 21).
const Cents = z.number().int().nonnegative();

export const PricingLineSchema = z.object({
  variantId: z.string().min(1),
  productId: z.string().min(1),
  qty: z.number().int().positive(),
  baseCents: Cents,
  saleCents: Cents.optional(),
  memberCents: Cents.optional(),
  // The sale price only counts while its flash sale is active; the service sets this flag.
  onSale: z.boolean().default(false),
  // Trial sizes (phase 14) and bundles (phase 16): base price only, no order discounts or codes,
  // but still counted towards shipping and gift thresholds.
  fixedPrice: z.boolean().default(false),
});

export const PricingCustomerSchema = z.object({
  isMember: z.boolean().default(false),
  orderCount: z.number().int().nonnegative().default(0),
  id: z.string().optional(),
  email: z.string().optional(),
});

// The service has already loaded the code and checked usage caps; the engine re-checks the
// things that depend on the cart (min spend, sale exclusion, first order) and the clock.
export const PricingCodeSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  kind: z.enum(['percent', 'fixed', 'free_shipping']),
  // percent: 0..100 (two decimals allowed). fixed: cents. free_shipping: ignored.
  value: z.number().nonnegative().default(0),
  minSpendCents: Cents.default(0),
  excludeSaleItems: z.boolean().default(false),
  firstOrderOnly: z.boolean().default(false),
  startsAt: z.date().optional(),
  endsAt: z.date().optional(),
});

export const PricingTierSchema = z.object({
  id: z.string().min(1),
  minCents: Cents,
  percent: z.number().gt(0).max(100),
});

export const PricingShippingSchema = z.object({
  methodCents: Cents,
  freeOverCents: Cents.optional(),
  // Express: never free, not by the threshold (none is given) and not by a free-shipping code.
  neverFree: z.boolean().default(false),
});

export const PricingGiftRuleSchema = z.object({
  id: z.string().min(1),
  thresholdCents: Cents,
  variantId: z.string().min(1),
  // The service passes false when the gift variant is out of stock.
  giftAvailable: z.boolean().default(true),
});

export const PricingCreditSchema = z.object({
  type: z.enum(['points', 'referral']),
  refId: z.string().min(1),
  label: z.string(),
  cents: Cents,
});

export const PriceCartInputSchema = z.object({
  now: z.date(),
  currency: z.string().length(3),
  lines: z.array(PricingLineSchema),
  customer: PricingCustomerSchema.default({ isMember: false, orderCount: 0 }),
  code: PricingCodeSchema.optional(),
  tiers: z.array(PricingTierSchema).default([]),
  giftRule: PricingGiftRuleSchema.optional(),
  shipping: PricingShippingSchema,
  credits: z.array(PricingCreditSchema).default([]),
  roundUpDonation: z.boolean().default(false),
  // Charges that are not goods (bottle deposit, bags): added to the total and to what the donation
  // rounds up and the minimum charge protects, never discounted, never counted by a threshold.
  feesCents: Cents.default(0),
});

export type PriceCartInput = z.input<typeof PriceCartInputSchema>;
export type PricingLine = z.input<typeof PricingLineSchema>;
export type PricingCode = z.input<typeof PricingCodeSchema>;

export type PriceSource = 'base' | 'member' | 'sale' | 'fixed';
export type AdjustmentType = 'bulk_tier' | 'code' | 'free_shipping' | 'credit';

export interface AppliedPromo {
  type: AdjustmentType;
  refId: string;
  label: string;
  cents: number;
}

export interface PricedLine {
  variantId: string;
  productId: string;
  qty: number;
  unitCents: number;
  priceSource: PriceSource;
  // unitCents * qty, before order-level adjustments
  lineSubtotalCents: number;
  // Order-level adjustments (tier, code, credits) allocated to this line. The single source
  // for `order_items.discount_cents` and for refund amounts.
  lineDiscountCents: number;
  lineTotalCents: number;
  appliedPromos: AppliedPromo[];
}

export interface Adjustment extends AppliedPromo {
  // 'lines' adjustments are allocated to lines; 'shipping' ones only reduce shipping.
  scope: 'lines' | 'shipping';
}

export interface Progress {
  thresholdCents: number;
  remainingCents: number;
  percent: number;
  reached: boolean;
}

export interface NextTierProgress extends Progress {
  discountPercent: number;
}

export type NoticeKey =
  | 'code_not_stackable'
  | 'code_min_spend'
  | 'code_no_eligible_items'
  | 'code_first_order_only'
  | 'code_not_started'
  | 'code_expired'
  | 'credit_capped';

export interface Notice {
  key: NoticeKey;
  refId?: string;
  // e.g. the amount still missing for `code_min_spend`
  cents?: number;
}

export interface PricedCart {
  pricedAt: string;
  currency: string;
  lines: PricedLine[];
  adjustments: Adjustment[];
  // sum of lineSubtotalCents
  subtotalCents: number;
  // sum of lineDiscountCents (all line-scoped adjustments)
  discountCents: number;
  // subtotal - discount, shipping excluded
  merchandiseCents: number;
  // The goods after discounts and BEFORE credits: what thresholds (free delivery, gift, a minimum
  // order) look at, so paying with points never changes them.
  goodsCents: number;
  // The non-goods charges that were added (`feesCents` of the input).
  feesCents: number;
  shippingCents: number;
  totalCents: number;
  // The round-up donation (phase 19): a separate order field, never part of a line, and included
  // in `totalCents`. 0 unless the input asked for it.
  donationCents: number;
  gift: { variantId: string; qty: 1; unitCents: 0 } | null;
  progress: {
    freeShipping: Progress | null;
    gift: Progress | null;
    nextTier: NextTierProgress | null;
  };
  notices: Notice[];
}
