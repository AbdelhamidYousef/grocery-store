import { z } from 'zod';

import { DataSchema } from './common.ts';

// ---------- storefront ----------

// One line of a kit, as the product page lists it.
export const BundleComponentSchema = z.object({
  variantId: z.string(),
  productSlug: z.string(),
  productName: z.string(),
  variantName: z.string(),
  qty: z.number().int().positive(),
  priceCents: z.number().int().min(0),
});
export type BundleComponent = z.infer<typeof BundleComponentSchema>;

// On a kit's own page: what is inside and what it saves.
export const BundleDetailSchema = z.object({
  variantId: z.string(),
  components: z.array(BundleComponentSchema),
  individualCents: z.number().int().min(0),
  savingCents: z.number().int().min(0),
});
export type BundleDetail = z.infer<typeof BundleDetailSchema>;

// On a component's page: a kit that contains this product ("Make it a kit").
export const KitTeaserSchema = z.object({
  slug: z.string(),
  name: z.string(),
  variantId: z.string(),
  priceCents: z.number().int().min(0),
  individualCents: z.number().int().min(0),
  savingCents: z.number().int().min(0),
  available: z.boolean(),
  contents: z.string(),
});
export type KitTeaser = z.infer<typeof KitTeaserSchema>;

// ---------- admin ----------

export const AdminBundleComponentInputSchema = z.object({
  variantId: z.uuid(),
  qty: z.number().int().min(1, 'At least 1').max(20, 'At most 20'),
});

const bundleFields = {
  priceCents: z.number().int().min(1, 'Required'),
  components: z
    .array(AdminBundleComponentInputSchema)
    .min(2, 'A kit needs at least two different products')
    .max(8, 'At most 8 components'),
};

const noDuplicates = (
  value: { components: { variantId: string }[] },
  ctx: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  value.components.forEach((c, i) => {
    if (seen.has(c.variantId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['components', i, 'variantId'],
        message: 'This variant is listed twice',
      });
    }
    seen.add(c.variantId);
  });
};

export const AdminBundleCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'At least 2 characters').max(80),
    slug: z
      .string()
      .trim()
      .min(2, 'At least 2 characters')
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lower-case letters, numbers and dashes only'),
    description: z.string().trim().min(1, 'Required').max(2000),
    ...bundleFields,
  })
  .superRefine(noDuplicates);
export type AdminBundleCreate = z.input<typeof AdminBundleCreateSchema>;

export const AdminBundleUpdateSchema = z.object(bundleFields).superRefine(noDuplicates);
export type AdminBundleUpdate = z.input<typeof AdminBundleUpdateSchema>;

export const AdminBundleSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  slug: z.string(),
  name: z.string(),
  priceCents: z.number().int().min(0),
  components: z.array(
    BundleComponentSchema.extend({ sku: z.string(), available: z.number().int().min(0) }),
  ),
  individualCents: z.number().int().min(0),
  savingCents: z.number().int().min(0),
  /** Kits that can be made from the stock left (derived, never stored). */
  available: z.number().int().min(0),
});
export type AdminBundle = z.infer<typeof AdminBundleSchema>;
export const AdminBundleResponseSchema = DataSchema(AdminBundleSchema);
export const AdminBundleListResponseSchema = DataSchema(z.array(AdminBundleSchema));
export const AdminBundleDeleteResponseSchema = DataSchema(z.object({ archived: z.literal(true) }));

// The picker: variants that may be put in a kit.
export const AdminBundleVariantOptionSchema = z.object({
  variantId: z.string(),
  label: z.string(),
  sku: z.string(),
  priceCents: z.number().int().min(0),
});
export type AdminBundleVariantOption = z.infer<typeof AdminBundleVariantOptionSchema>;
export const AdminBundleVariantsResponseSchema = DataSchema(
  z.array(AdminBundleVariantOptionSchema),
);
