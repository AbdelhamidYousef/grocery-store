import { z } from 'zod';

import { DataSchema } from './common.ts';
import { ReorderResultSchema } from './reorder.ts';
import { WishlistItemSchema } from './wishlist.ts';

// Named shopping lists (G9.3), built on the wishlist: every account has a default list called
// "Saved" (the old wishlist, same routes, same share link) and can add more ("Weekly shop",
// "Party"), each item with a quantity.

export const LISTS_MAX = 20;
export const LIST_ITEM_MAX_QUANTITY = 99;

export const ListNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the list a name')
  .max(40, 'At most 40 characters');

export const ListSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** "Saved": cannot be renamed or deleted, and is the one the heart on a product writes to. */
  isDefault: z.boolean(),
  itemCount: z.number().int().min(0),
});
export type ListSummary = z.infer<typeof ListSummarySchema>;
export const ListsResponseSchema = DataSchema(z.array(ListSummarySchema));

export const ListDetailSchema = ListSummarySchema.extend({
  /** The wishlist item (with the variant chosen for it, its price and whether it is in stock at the store). */
  items: z.array(WishlistItemSchema),
});
export type ListDetail = z.infer<typeof ListDetailSchema>;
export const ListDetailResponseSchema = DataSchema(ListDetailSchema);

export const ListParamsSchema = z.object({ id: z.uuid() });
export const ListItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() });

export const CreateListSchema = z.object({ name: ListNameSchema });
export const RenameListSchema = z.object({ name: ListNameSchema });

/** Puts a product (or one variant of it) on a list; the quantity REPLACES an earlier one. */
export const PutListItemSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().optional(),
  quantity: z.number().int().min(1).max(LIST_ITEM_MAX_QUANTITY).default(1),
});
export type PutListItemInput = z.input<typeof PutListItemSchema>;

export const SetListItemQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(LIST_ITEM_MAX_QUANTITY),
});

/** "Add all to basket": the lines that went in and the ones that could not, with the reason. */
export const ListToCartResponseSchema = DataSchema(ReorderResultSchema);
