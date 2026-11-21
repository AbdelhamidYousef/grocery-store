import { z } from 'zod';

import { DataSchema } from './common.ts';

// The packer view (G8): the orders a dark store has to pack soon and the pick list walked for them.

export const PICK_ZONES = ['ambient', 'chilled', 'frozen'] as const;
export type PickZone = (typeof PICK_ZONES)[number];
/** One packer works on a handful of bags; a longer list is cut (oldest window first). */
export const PICK_ORDER_LIMIT = 30;
export const PickZoneSchema = z.enum(PICK_ZONES);

export const PickingStoreParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
});

// `next`: paid orders whose window starts within two hours (and express orders); `all`: every order
// still to be packed or handed over.
export const PickingQuerySchema = z.object({
  window: z.enum(['next', 'all']).default('next'),
  // Find one bag by its number, whatever its window.
  order: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(GR|PW)-\d{4}-\d{6,}$/, 'Not an order number')
    .optional(),
});
export type PickingQuery = z.input<typeof PickingQuerySchema>;

export const PickBatchSchema = z.object({
  bestBefore: z.string().nullable(),
  quantity: z.number().int().min(1),
});

export const PickLineSchema = z.object({
  itemId: z.string(),
  orderNumber: z.string(),
  /** Which bag of the list this is (1, 2, ...), the order of the windows. */
  bag: z.number().int().min(1),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int().min(1),
  pickedQty: z.number().int().min(0).nullable(),
  pickStatus: z.enum(['pending', 'picked', 'short', 'missing', 'substituted']),
  /** Sold by weight: the packer enters grams. */
  weighed: z.boolean(),
  pricePerKgCents: z.number().int().nullable(),
  packedGrams: z.number().int().nullable(),
  /** The name of the item this line replaces (a replacement), else null. */
  replaces: z.string().nullable(),
  swapStatus: z.enum(['proposed', 'accepted', 'rejected']).nullable(),
  substitution: z.enum(['best_match', 'specific', 'none']),
  zone: PickZoneSchema,
  aisle: z.number().int().nullable(),
  /** The packs to take, oldest best-before first (the stock taken for this line when it was paid). */
  batches: z.array(PickBatchSchema),
  /** Nothing left to do for this line. */
  resolved: z.boolean(),
});
export type PickLine = z.infer<typeof PickLineSchema>;

export const PickingOrderSchema = z.object({
  number: z.string(),
  bag: z.number().int().min(1),
  status: z.enum(['paid', 'processing']),
  deliveryKind: z.enum(['slot', 'express']).nullable(),
  deliveryFrom: z.string().nullable(),
  deliveryTo: z.string().nullable(),
  firstName: z.string().nullable(),
  packedAt: z.string().nullable(),
  lines: z.array(PickLineSchema),
  /** Lines still to pick, weigh or settle. */
  openLines: z.number().int().min(0),
  /** Replacements the shopper has not answered yet (they count as accepted at dispatch). */
  openSwaps: z.number().int().min(0),
});
export type PickingOrder = z.infer<typeof PickingOrderSchema>;

// One stop of the walk: a product, with the bags it goes to.
export const PickListEntrySchema = z.object({
  key: z.string(),
  zone: PickZoneSchema,
  aisle: z.number().int().nullable(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  weighed: z.boolean(),
  totalQty: z.number().int().min(1),
  remainingQty: z.number().int().min(0),
  stops: z.array(
    z.object({
      itemId: z.string(),
      orderNumber: z.string(),
      bag: z.number().int().min(1),
      quantity: z.number().int().min(1),
      resolved: z.boolean(),
      batches: z.array(PickBatchSchema),
    }),
  ),
});
export type PickListEntry = z.infer<typeof PickListEntrySchema>;

export const PickingResultSchema = z.object({
  store: z.object({ slug: z.string(), name: z.string() }),
  generatedAt: z.string(),
  /** Orders matching the view; `orders` holds at most the first PICK_ORDER_LIMIT of them. */
  totalOrders: z.number().int().min(0),
  orders: z.array(PickingOrderSchema),
  pickList: z.array(PickListEntrySchema),
});
export type PickingResult = z.infer<typeof PickingResultSchema>;
export const PickingResponseSchema = DataSchema(PickingResultSchema);

export const PickStoreSchema = z.object({
  slug: z.string(),
  name: z.string(),
});
export const PickStoresResponseSchema = DataSchema(z.array(PickStoreSchema));

// ---------- marking a line ----------

export const PickLineParamsSchema = z.object({
  number: z.string().regex(/^(GR|PW)-\d{4}-\d{6,}$/, 'Not an order number'),
  itemId: z.uuid(),
});

// `found`: every unit is in the bag; `weigh`: grams on the scale (a weighed line); `reset`: undo.
export const PickLineActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('found') }),
  z.object({ action: z.literal('weigh'), grams: z.number().int().min(1).max(50_000) }),
  z.object({ action: z.literal('reset') }),
]);
export type PickLineAction = z.input<typeof PickLineActionSchema>;

export const PickLineResultSchema = z.object({
  orderNumber: z.string(),
  itemId: z.string(),
  pickStatus: z.enum(['pending', 'picked', 'short', 'missing', 'substituted']),
  packedGrams: z.number().int().nullable(),
});
export const PickLineResponseSchema = DataSchema(PickLineResultSchema);
