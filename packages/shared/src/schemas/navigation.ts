import { z } from 'zod';

import { DataSchema } from './common.ts';

// ---------- mega-menu (phase 15) ----------

export const NavPromoSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  imageUrl: z.string(),
  imageAlt: z.string(),
  link: z.string(),
});
export type NavPromo = z.infer<typeof NavPromoSchema>;

export const NavDepartmentSchema = z.object({
  // The department slug (the same in every store view; `/c/<slug>` resolves in each): what "See all"
  // links to, and what the per-department colours and icons key on.
  slug: z.string(),
  name: z.string(),
  categories: z.array(
    z.object({ slug: z.string(), name: z.string(), productCount: z.number().int().min(0) }),
  ),
  // Brands that sell something in this department, biggest first.
  brands: z.array(z.object({ slug: z.string(), name: z.string() })),
  promo: NavPromoSchema.nullable(),
});
export type NavDepartment = z.infer<typeof NavDepartmentSchema>;

export const NavigationSchema = z.object({ departments: z.array(NavDepartmentSchema) });
export type Navigation = z.infer<typeof NavigationSchema>;
export const NavigationResponseSchema = DataSchema(NavigationSchema);

// ---------- admin: menu promos ----------

// A tile may link inside the shop ("/collections/summer") or out to https, never to `//host`
// (protocol-relative) or `javascript:`.
const LinkSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/(?!\/)\S*|https:\/\/\S+)$/, 'Use a path like /collections/summer or an https link');

const ImageUrlSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/(?!\/)\S+|https:\/\/\S+)$/, 'Use a path like /products/x.webp or an https link');

const AdminMenuPromoBase = z.object({
  // The department's top-level category id; null = shown in every panel that has no promo of its own.
  categoryId: z.uuid().nullable(),
  title: z.string().trim().min(1, 'Required').max(60),
  subtitle: z.string().trim().max(120),
  imageUrl: ImageUrlSchema,
  imageAlt: z.string().trim().min(1, 'Describe the picture').max(160),
  link: LinkSchema,
  sortOrder: z.number().int().min(0).max(10_000),
  active: z.boolean(),
});

// Defaults live on the create schema only: a `.default()` inside a partial() would fill the
// field in when a PATCH leaves it out, silently overwriting the stored value.
export const AdminMenuPromoInputSchema = AdminMenuPromoBase.extend({
  subtitle: AdminMenuPromoBase.shape.subtitle.default(''),
  sortOrder: AdminMenuPromoBase.shape.sortOrder.optional(),
  active: AdminMenuPromoBase.shape.active.default(true),
});
export type AdminMenuPromoInput = z.input<typeof AdminMenuPromoInputSchema>;

export const AdminMenuPromoUpdateSchema = AdminMenuPromoBase.partial().refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Nothing to update',
);
export type AdminMenuPromoUpdate = z.input<typeof AdminMenuPromoUpdateSchema>;

export const AdminMenuPromoSchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable(),
  title: z.string(),
  subtitle: z.string(),
  imageUrl: z.string(),
  imageAlt: z.string(),
  link: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
export type AdminMenuPromo = z.infer<typeof AdminMenuPromoSchema>;
export const AdminMenuPromoResponseSchema = DataSchema(AdminMenuPromoSchema);
export const AdminMenuPromoListResponseSchema = DataSchema(z.array(AdminMenuPromoSchema));
