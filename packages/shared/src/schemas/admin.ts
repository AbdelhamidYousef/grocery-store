import { z } from 'zod';

import { DataSchema, PaginatedSchema, PaginationQuerySchema } from './common.ts';

// ---------- dashboard ----------

// Day boundaries are UTC. Revenue counts orders that were paid and are still standing (paid,
// processing, shipped, delivered): cancelled and refunded orders are not revenue.
export const AdminStatsSchema = z.object({
  ordersToday: z.number().int().min(0),
  revenue30dCents: z.number().int().min(0),
  currency: z.string().length(3),
  // Active variants whose available stock (quantity - reserved) is at or below their threshold.
  lowStockCount: z.number().int().min(0),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;

export const AdminStatsResponseSchema = DataSchema(AdminStatsSchema);

// ---------- shared building blocks ----------

export const ProductStatusSchema = z.enum(['draft', 'active', 'archived']);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

// Why stock changed. `return` is for units that came back from a customer after shipping and were
// inspected: the order state machine never restocks shipped goods by itself.
export const InventoryReasonSchema = z.enum(['restock', 'correction', 'damage', 'return']);
export type InventoryReason = z.infer<typeof InventoryReasonSchema>;

const MAX_PRICE_CENTS = 10_000_000; // 100,000.00: a typo guard, not a business rule

// Images are URLs, never uploads: there is no object storage in the stack (free tiers only), so an
// admin points at a file already served by the web app (`/products/<name>.webp`) or at an https
// URL. Anything else (`javascript:`, `data:`, `//host`, path traversal) is refused.
export const ImageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v.startsWith('/products/')) return !v.includes('..') && !v.includes('//') && !/\s/.test(v);
    // No URL class in this package: a plain https check is enough, the web app only ever puts
    // the value in an <img src>.
    return /^https:\/\/[^\s/$.?#][^\s]*$/i.test(v);
  }, 'Use a path under /products/ or an https:// URL');

export const AdminImageInputSchema = z.object({
  url: ImageUrlSchema,
  alt: z.string().trim().min(1, 'Alt text is required').max(200),
  // Known dimensions stop layout shift; they cannot be read from a URL without fetching it.
  width: z.number().int().min(1).max(10_000),
  height: z.number().int().min(1).max(10_000),
  // Ties the image to one variant (a colour) by SKU; omitted means a plain product image. SKU, not
  // id, because on create the variants have no id yet.
  variantSku: z.string().trim().min(1).max(64).nullish(),
});
export type AdminImageInput = z.input<typeof AdminImageInputSchema>;

// ---------- variants ----------

const SkuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Letters, digits, dot, dash and underscore only');

const OptionsSchema = z
  .record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(60))
  .refine((o) => Object.keys(o).length <= 6, 'At most 6 options');

const VariantFields = {
  sku: SkuSchema,
  name: z.string().trim().min(1).max(120),
  options: OptionsSchema,
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS),
  compareAtPriceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullish(),
  weightGrams: z.number().int().min(1).max(100_000),
  isDefault: z.boolean().optional(),
  status: ProductStatusSchema.default('active'),
  lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
};

const compareAtAbovePrice = (v: {
  priceCents?: number | undefined;
  compareAtPriceCents?: number | null | undefined;
}) =>
  v.compareAtPriceCents == null ||
  v.priceCents === undefined ||
  v.compareAtPriceCents > v.priceCents;
const COMPARE_AT_MESSAGE = 'The strike-through price must be higher than the price';

export const AdminVariantInputSchema = z
  .object({
    ...VariantFields,
    // Opening stock; later changes go through the inventory endpoint, which records a reason.
    stock: z.number().int().min(0).max(1_000_000).default(0),
  })
  .refine(compareAtAbovePrice, { message: COMPARE_AT_MESSAGE, path: ['compareAtPriceCents'] });
export type AdminVariantInput = z.input<typeof AdminVariantInputSchema>;

export const AdminVariantUpdateSchema = z
  .object({
    ...VariantFields,
    status: ProductStatusSchema,
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')
  .refine(compareAtAbovePrice, { message: COMPARE_AT_MESSAGE, path: ['compareAtPriceCents'] });
export type AdminVariantUpdate = z.input<typeof AdminVariantUpdateSchema>;

export const AdminVariantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  name: z.string(),
  options: z.record(z.string(), z.string()),
  priceCents: z.number().int(),
  compareAtPriceCents: z.number().int().nullable(),
  currency: z.string().length(3),
  weightGrams: z.number().int(),
  isDefault: z.boolean(),
  status: ProductStatusSchema,
  quantity: z.number().int(),
  reserved: z.number().int(),
  // quantity - reserved, computed once by the server so the UI never subtracts.
  available: z.number().int(),
  lowStockThreshold: z.number().int(),
  updatedAt: z.string(),
});
export type AdminVariant = z.infer<typeof AdminVariantSchema>;
export const AdminVariantResponseSchema = DataSchema(AdminVariantSchema);

// ---------- products ----------

// The jsonb `attributes` column, validated: the facet keys are typed, `optionKeys` is the ordered
// option schema, and nothing else is accepted (an editor with free-form keys would let typos
// become facets).
export const AdminAttributesSchema = z
  .object({
    pet: z.enum(['dog', 'cat', 'bird', 'fish', 'small']),
    material: z.string().trim().min(1).max(60),
    brand: z.string().trim().min(1).max(60),
    ageStage: z.enum(['puppy', 'kitten', 'adult', 'senior', 'all']),
    size: z.string().trim().min(1).max(60),
    optionKeys: z.array(z.string().trim().min(1).max(40)).max(6),
  })
  .partial()
  .strict();
export type AdminAttributes = z.infer<typeof AdminAttributesSchema>;

const ProductFields = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(10_000),
  categoryId: z.uuid(),
  status: ProductStatusSchema,
  attributes: AdminAttributesSchema,
};

export const AdminProductCreateSchema = z.object({
  ...ProductFields,
  status: ProductStatusSchema.default('draft'),
  attributes: AdminAttributesSchema.default({}),
  // Generated from the name (with a numeric suffix if taken) unless given.
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lower-case letters, digits and dashes')
    .optional(),
  variants: z.array(AdminVariantInputSchema).min(1, 'A product needs at least one variant').max(60),
  images: z.array(AdminImageInputSchema).max(20).default([]),
});
export type AdminProductCreate = z.input<typeof AdminProductCreateSchema>;

// PATCH: send only what changes. `images`, when sent, REPLACES the whole list (that is how an
// image list is edited: reorder, remove, add, in one save). The slug is not editable: public URLs
// must not move because a name was corrected.
export const AdminProductUpdateSchema = z
  .object(ProductFields)
  .extend({ images: z.array(AdminImageInputSchema).max(20) })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export type AdminProductUpdate = z.input<typeof AdminProductUpdateSchema>;

export const AdminProductImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  variantId: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const AdminProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  status: ProductStatusSchema,
  category: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  attributes: z.record(z.string(), z.unknown()),
  variants: z.array(AdminVariantSchema),
  images: z.array(AdminProductImageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminProduct = z.infer<typeof AdminProductSchema>;
export const AdminProductResponseSchema = DataSchema(AdminProductSchema);

export const AdminProductListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: ProductStatusSchema.optional(),
});
export type AdminProductListQuery = z.input<typeof AdminProductListQuerySchema>;

export const AdminProductRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: ProductStatusSchema,
  categoryName: z.string(),
  variantCount: z.number().int().min(0),
  // Null only for a product with no variants left (not creatable, but robust).
  minPriceCents: z.number().int().nullable(),
  maxPriceCents: z.number().int().nullable(),
  currency: z.string().length(3),
  // Units available across all variants.
  availableStock: z.number().int(),
  imageUrl: z.string().nullable(),
  updatedAt: z.string(),
});
export type AdminProductRow = z.infer<typeof AdminProductRowSchema>;
export const AdminProductListResponseSchema = PaginatedSchema(AdminProductRowSchema);

// ---------- inventory ----------

// Absolute set, not a delta: "there are 12 on the shelf" is what a person counts. The server
// derives the delta and records it with the reason.
export const AdminInventorySetSchema = z.object({
  quantity: z.number().int().min(0).max(1_000_000),
  reason: InventoryReasonSchema,
  note: z.string().trim().max(300).optional(),
});
export type AdminInventorySet = z.input<typeof AdminInventorySetSchema>;

export const AdminInventoryResponseSchema = DataSchema(
  z.object({
    variantId: z.string(),
    quantity: z.number().int(),
    reserved: z.number().int(),
    available: z.number().int(),
    // The change that was recorded (0 when the count already matched).
    delta: z.number().int(),
  }),
);
export type AdminInventoryResult = z.infer<typeof AdminInventoryResponseSchema>['data'];

export const AdminVariantParamsSchema = z.object({ variantId: z.uuid() });
