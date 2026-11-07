import { z } from 'zod';

import { NetUnitSchema, PetSchema } from '../pets.ts';

import { OrderSchema, OrderStatusSchema, PaymentStatusSchema } from './checkout.ts';
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
  // Price for signed-in shoppers; null/absent = none. Must stay below the regular price.
  memberPriceCents: z.number().int().min(1).max(MAX_PRICE_CENTS).nullish(),
  weightGrams: z.number().int().min(1).max(100_000),
  isDefault: z.boolean().optional(),
  status: ProductStatusSchema.default('active'),
  lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
  // What is inside, for the unit price. Amount and unit come as a pair (or neither).
  netAmount: z.number().int().min(1).max(10_000_000).nullish(),
  netUnit: NetUnitSchema.nullish(),
  isTrial: z.boolean().optional(),
  swatchHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'A colour like #A1B2C3')
    .nullish(),
};

const netPair = (v: {
  netAmount?: number | null | undefined;
  netUnit?: string | null | undefined;
}) => (v.netAmount == null) === (v.netUnit == null);
const NET_PAIR_MESSAGE = 'Give the net amount and its unit together, or neither';

const compareAtAbovePrice = (v: {
  priceCents?: number | undefined;
  compareAtPriceCents?: number | null | undefined;
}) =>
  v.compareAtPriceCents == null ||
  v.priceCents === undefined ||
  v.compareAtPriceCents > v.priceCents;
const memberBelowPrice = (v: {
  priceCents?: number | undefined;
  memberPriceCents?: number | null | undefined;
}) => v.memberPriceCents == null || v.priceCents === undefined || v.memberPriceCents < v.priceCents;
const MEMBER_MESSAGE = 'The member price must be lower than the price';
const COMPARE_AT_MESSAGE = 'The strike-through price must be higher than the price';

export const AdminVariantInputSchema = z
  .object({
    ...VariantFields,
    // Opening stock; later changes go through the inventory endpoint, which records a reason.
    stock: z.number().int().min(0).max(1_000_000).default(0),
  })
  .refine(compareAtAbovePrice, { message: COMPARE_AT_MESSAGE, path: ['compareAtPriceCents'] })
  .refine(memberBelowPrice, { message: MEMBER_MESSAGE, path: ['memberPriceCents'] })
  .refine(netPair, { message: NET_PAIR_MESSAGE, path: ['netAmount'] });
export type AdminVariantInput = z.input<typeof AdminVariantInputSchema>;

export const AdminVariantUpdateSchema = z
  .object({
    ...VariantFields,
    status: ProductStatusSchema,
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')
  .refine(compareAtAbovePrice, { message: COMPARE_AT_MESSAGE, path: ['compareAtPriceCents'] })
  .refine(memberBelowPrice, { message: MEMBER_MESSAGE, path: ['memberPriceCents'] })
  // On a PATCH, "set neither" means "leave both alone"; setting one alone would pair it with the
  // old other half, so it is refused.
  .refine(netPair, { message: NET_PAIR_MESSAGE, path: ['netAmount'] });
export type AdminVariantUpdate = z.input<typeof AdminVariantUpdateSchema>;

export const AdminVariantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  name: z.string(),
  options: z.record(z.string(), z.string()),
  priceCents: z.number().int(),
  compareAtPriceCents: z.number().int().nullable(),
  memberPriceCents: z.number().int().nullable(),
  currency: z.string().length(3),
  weightGrams: z.number().int(),
  isDefault: z.boolean(),
  netAmount: z.number().int().nullable(),
  netUnit: NetUnitSchema.nullable(),
  isTrial: z.boolean(),
  swatchHex: z.string().nullable(),
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
    pet: PetSchema,
    material: z.string().trim().min(1).max(60),
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
  // Normalised brand and the editorial flags (everything else on a badge is derived).
  brandId: z.uuid().nullable(),
  isEco: z.boolean(),
  isBestsellerOverride: z.boolean(),
  badgeNewUntil: z.iso.datetime({ offset: true }).nullable(),
};

export const AdminProductCreateSchema = z.object({
  ...ProductFields,
  status: ProductStatusSchema.default('draft'),
  attributes: AdminAttributesSchema.default({}),
  brandId: ProductFields.brandId.default(null),
  isEco: ProductFields.isEco.default(false),
  isBestsellerOverride: ProductFields.isBestsellerOverride.default(false),
  badgeNewUntil: ProductFields.badgeNewUntil.default(null),
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
  brandId: z.string().nullable(),
  isEco: z.boolean(),
  isBestsellerOverride: z.boolean(),
  badgeNewUntil: z.string().nullable(),
  tags: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
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

// ---------- orders ----------

export const AdminOrderListQuerySchema = PaginationQuerySchema.extend({
  status: OrderStatusSchema.optional(),
  // Order number or customer email, partial and case-insensitive.
  q: z.string().trim().max(100).optional(),
});
export type AdminOrderListQuery = z.input<typeof AdminOrderListQuerySchema>;

export const AdminOrderRowSchema = z.object({
  number: z.string(),
  status: OrderStatusSchema,
  email: z.string(),
  totalCents: z.number().int().min(0),
  currency: z.string().length(3),
  itemCount: z.number().int().min(0),
  paymentStatus: PaymentStatusSchema.nullable(),
  placedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminOrderRow = z.infer<typeof AdminOrderRowSchema>;
export const AdminOrderListResponseSchema = PaginatedSchema(AdminOrderRowSchema);

// The audit trail IS shown to the admin in full: who, what, when and the note.
export const AdminHistoryEntrySchema = z.object({
  fromStatus: OrderStatusSchema.nullable(),
  toStatus: OrderStatusSchema,
  actor: z.string(),
  note: z.string().nullable(),
  at: z.string(),
});
export type AdminHistoryEntry = z.infer<typeof AdminHistoryEntrySchema>;

export const AdminOrderDetailSchema = z.object({
  order: OrderSchema,
  payment: z
    .object({
      status: PaymentStatusSchema,
      // The `pi_...` id, for the link to the Stripe dashboard (test mode).
      providerPaymentIntentId: z.string().nullable(),
      amountCents: z.number().int(),
      currency: z.string().length(3),
      lastError: z.string().nullable(),
    })
    .nullable(),
  customer: z.object({ id: z.string(), email: z.string(), name: z.string() }).nullable(),
  history: z.array(AdminHistoryEntrySchema),
  // What the transition buttons may offer: exactly the state machine's requestable moves.
  allowedNext: z.array(OrderStatusSchema),
});
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>;
export const AdminOrderDetailResponseSchema = DataSchema(AdminOrderDetailSchema);

export const AdminTransitionSchema = z.object({
  to: OrderStatusSchema,
  note: z.string().trim().max(300).optional(),
});
export type AdminTransition = z.input<typeof AdminTransitionSchema>;

// ---------- customers ----------

export const AdminCustomerListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
});
export type AdminCustomerListQuery = z.input<typeof AdminCustomerListQuerySchema>;

// Deliberately no password hash, sessions or addresses: the list needs identity and activity only.
export const AdminCustomerRowSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  // Orders that were actually placed (pending, abandoned checkouts do not count).
  orderCount: z.number().int().min(0),
  lastOrderAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminCustomerRow = z.infer<typeof AdminCustomerRowSchema>;
export const AdminCustomerListResponseSchema = PaginatedSchema(AdminCustomerRowSchema);
