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
