import { z } from 'zod';

import { CartSchema } from './cart.ts';
import { DataSchema } from './common.ts';

export const BUY_AGAIN_LIMIT = 24;

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
