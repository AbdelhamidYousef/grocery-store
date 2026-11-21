import { z } from 'zod';

import { CartSchema } from './cart.ts';
import { DataSchema } from './common.ts';

export const BUY_AGAIN_LIMIT = 24;

// "Your usuals" (G9.2): variants bought in at least USUALS_MIN_ORDERS of the shopper's last
// USUALS_ORDER_WINDOW paid orders, most often first, in stock at the shopper's store. A rule anyone
// can check by hand, not a model.
export const USUALS_ORDER_WINDOW = 10;
export const USUALS_MIN_ORDERS = 2;
export const USUALS_LIMIT = 12;

export const BuyAgainItemSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  slug: z.string(),
  name: z.string(),
  variantName: z.string(),
  image: z
    .object({ url: z.string(), alt: z.string(), width: z.number(), height: z.number() })
    .nullable(),
  /** TODAY's price, not what was paid. */
  priceCents: z.number().int(),
  currency: z.string(),
  available: z.boolean(),
  lastBoughtAt: z.string(),
  timesBought: z.number().int(),
});
export type BuyAgainItem = z.infer<typeof BuyAgainItemSchema>;
export const BuyAgainResponseSchema = DataSchema(z.array(BuyAgainItemSchema));

// The usuals and the order "Reorder last basket" repeats (null before the first paid order). `timesBought`
// of an item is the number of the last orders it was in.
export const UsualsSchema = z.object({
  items: z.array(BuyAgainItemSchema),
  lastOrder: z.object({ number: z.string(), placedAt: z.string() }).nullable(),
});
export type Usuals = z.infer<typeof UsualsSchema>;
export const UsualsResponseSchema = DataSchema(UsualsSchema);

/** An order id (uuid) or an order number. */
export const ReorderParamsSchema = z.object({ id: z.string().trim().min(1).max(60) });

export const SKIP_REASONS = ['unavailable', 'sold_out', 'limit'] as const;
export const ReorderSkippedSchema = z.object({
  name: z.string(),
  variantName: z.string(),
  reason: z.enum(SKIP_REASONS),
});
export const ReorderResultSchema = z.object({
  cart: CartSchema,
  /** Lines added, with the quantity that actually went in. */
  added: z.array(
    z.object({ name: z.string(), variantName: z.string(), quantity: z.number().int() }),
  ),
  skipped: z.array(ReorderSkippedSchema),
});
export type ReorderResult = z.infer<typeof ReorderResultSchema>;
export const ReorderResponseSchema = DataSchema(ReorderResultSchema);
