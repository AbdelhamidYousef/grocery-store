import { z } from 'zod';

// What the cart shows from the pricing engine (packages/shared/src/pricing). The engine's own
// output is a plain interface; this is the wire contract for the parts the storefront needs.

const Cents = z.number().int();

const ProgressSchema = z.object({
  thresholdCents: Cents,
  remainingCents: Cents,
  percent: z.number().int().min(0).max(100),
  reached: z.boolean(),
});

export const CartPricingSchema = z.object({
  // The code the shopper applied, as stored on the cart (it may currently not apply: see notices).
  code: z.string().nullable(),
  lines: z.array(
    z.object({
      variantId: z.string(),
      // What one unit really costs after the best single price (base, sale or member).
      unitCents: Cents,
      priceSource: z.enum(['base', 'member', 'sale', 'fixed']),
      lineDiscountCents: Cents,
      // For a line at a flash-sale price: the EU Omnibus reference (lowest price in the 30 days
      // before the sale). Null when the line is not on sale or the variant had no history.
      referenceCents: Cents.nullable(),
    }),
  ),
  adjustments: z.array(
    z.object({
      type: z.enum(['bulk_tier', 'code', 'free_shipping', 'credit']),
      refId: z.string(),
      label: z.string(),
      cents: Cents,
      scope: z.enum(['lines', 'shipping']),
    }),
  ),
  discountCents: Cents,
  merchandiseCents: Cents,
  // An estimate with the standard method; checkout prices the method actually chosen.
  shippingEstimateCents: Cents,
  totalEstimateCents: Cents,
  gift: z
    .object({
      variantId: z.string(),
      productName: z.string(),
      variantName: z.string(),
      imageUrl: z.string().nullable(),
    })
    .nullable(),
  progress: z.object({
    freeShipping: ProgressSchema.nullable(),
    gift: ProgressSchema.nullable(),
    nextTier: ProgressSchema.extend({ discountPercent: z.number() }).nullable(),
  }),
  notices: z.array(
    z.object({
      key: z.string(),
      refId: z.string().optional(),
      cents: Cents.optional(),
    }),
  ),
});
export type CartPricing = z.infer<typeof CartPricingSchema>;

export const ApplyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Enter a code')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Codes are letters and numbers only'),
});
export type ApplyCodeInput = z.input<typeof ApplyCodeSchema>;

// ---------- flash sales (step 18.6) ----------

// A sale price that applies right now to a variant or, on a product card, to the cheapest-sale
// variant of the product. `referenceCents` is the EU Omnibus reference (lowest price in the 30
// days before the sale started); null means there was no history, so no strike-through may be
// shown. `basePriceCents` is the regular price the sale price is measured against.
export const SaleOfferSchema = z.object({
  priceCents: Cents.min(0),
  referenceCents: Cents.min(0).nullable(),
  basePriceCents: Cents.min(0),
  // On a card: the earliest end among the product's sale variants.
  endsAt: z.string(),
});
export type SaleOffer = z.infer<typeof SaleOfferSchema>;

// ---------- member prices (step 18.7) ----------

// What a signed-in shopper pays as a member (on a card: the lowest among the product's variants).
// ONLY signed-in responses carry it; an anonymous response has `member: null` and just the boolean
// `hasMemberPrice` next to it, so the number never reaches a guest (hiding it in CSS would still
// leak it in the payload).
export const MemberOfferSchema = z.object({ priceCents: z.number().int().min(1) });
export type MemberOffer = z.infer<typeof MemberOfferSchema>;

export const BannerSaleSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(['scheduled', 'active']),
});
export type BannerSale = z.infer<typeof BannerSaleSchema>;

export const BannerResponseSchema = z.object({
  data: z.object({
    sale: BannerSaleSchema.nullable(),
    // The server's clock, so the countdown can ignore a wrong device clock.
    serverNow: z.string(),
  }),
});
export type BannerResponse = z.infer<typeof BannerResponseSchema>;

export const PromotionRulesResponseSchema = z.object({
  data: z.object({
    tiers: z.array(z.object({ minCents: Cents, percent: z.number().int() })),
    gift: z
      .object({ thresholdCents: Cents, productName: z.string(), variantName: z.string() })
      .nullable(),
    // Of the standard delivery method; null when it has none.
    freeDeliveryThresholdCents: Cents.nullable(),
  }),
});
export type PromotionRulesResponse = z.infer<typeof PromotionRulesResponseSchema>;
