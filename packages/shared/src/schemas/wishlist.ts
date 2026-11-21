import { z } from 'zod';

import { DataSchema } from './common.ts';

export const WISHLIST_MAX_ITEMS = 100;

export const WishlistAddSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().optional(),
});
export type WishlistAdd = z.infer<typeof WishlistAddSchema>;

export const WishlistItemParamsSchema = z.object({ id: z.uuid() });

export const WishlistItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  slug: z.string(),
  name: z.string(),
  image: z
    .object({ url: z.string(), alt: z.string(), width: z.number(), height: z.number() })
    .nullable(),
  // The saved variant, or the product's default when only the product was saved. Null when the
  // product has no active variant any more.
  variantId: z.string().nullable(),
  variantName: z.string().nullable(),
  priceCents: z.number().int().nullable(),
  currency: z.string(),
  available: z.boolean(),
  // How many (G9.3, shopping lists); a wishlist heart saves one.
  quantity: z.number().int().min(1).default(1),
});
export type WishlistItem = z.infer<typeof WishlistItemSchema>;

export const WishlistSchema = z.object({
  items: z.array(WishlistItemSchema),
  /** The public link's token while sharing is on; null when it is off. */
  shareToken: z.string().nullable(),
});
export type Wishlist = z.infer<typeof WishlistSchema>;
export const WishlistResponseSchema = DataSchema(WishlistSchema);

export const SharedWishlistSchema = z.object({
  /** First name only: a shared list says whose it is, nothing more. */
  ownerFirstName: z.string(),
  items: z.array(WishlistItemSchema),
});
export type SharedWishlist = z.infer<typeof SharedWishlistSchema>;
export const SharedWishlistResponseSchema = DataSchema(SharedWishlistSchema);
export const SharedWishlistParamsSchema = z.object({ token: z.string().min(16).max(128) });
