import { z } from 'zod';

import { FeedingRowSchema, FeedingTableInputSchema } from '../feeding.ts';

import { DataSchema, optionalText } from './common.ts';
import { ConstituentSchema, SizeGuideTableSchema, SpecSchema } from './pdp.ts';

// Back-office contract for the product-page content (phase 16). The database has CHECK constraints
// for the same rules; these schemas give a person the sentence first.

const label = z.string().trim().min(1, 'Required').max(60, 'At most 60 characters');

export const AdminSpecInputSchema = z.object({
  label,
  value: z.string().trim().min(1, 'Required').max(200, 'At most 200 characters'),
});

export const AdminFaqInputSchema = z.object({
  question: z.string().trim().min(1, 'Required').max(200, 'At most 200 characters'),
  answer: z.string().trim().min(1, 'Required').max(1500, 'At most 1500 characters'),
});

// Percent inputs are turned into basis points at the edge of the form; here they are integers.
export const AdminConstituentsInputSchema = z.object({
  variantId: z.uuid(),
  values: z
    .array(ConstituentSchema)
    .max(6)
    .superRefine((values, ctx) => {
      const seen = new Set<string>();
      values.forEach((v, i) => {
        if (seen.has(v.key)) {
          ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Each value can appear once' });
        }
        seen.add(v.key);
      });
    }),
});

// Every section is optional: a section that is absent is left alone, one that is present
// REPLACES what is stored (the editors submit whole lists, so there is no partial-update puzzle).
export const AdminProductContentInputSchema = z.object({
  specs: z
    .array(AdminSpecInputSchema)
    .max(30)
    .superRefine((specs, ctx) => {
      const seen = new Set<string>();
      specs.forEach((s, i) => {
        const key = s.label.toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', path: [i, 'label'], message: 'This label is used twice' });
        }
        seen.add(key);
      });
    })
    .optional(),
  faqs: z.array(AdminFaqInputSchema).max(20).optional(),
  feedingTable: FeedingTableInputSchema.optional(),
  constituents: z.array(AdminConstituentsInputSchema).max(60).optional(),
  deliveryNote: optionalText(300),
  sizeGuideId: z.uuid().nullable().optional(),
});
export type AdminProductContentInput = z.input<typeof AdminProductContentInputSchema>;

export const AdminProductContentSchema = z.object({
  specs: z.array(SpecSchema),
  faqs: z.array(AdminFaqInputSchema.extend({ id: z.string() })),
  feedingTable: z.array(FeedingRowSchema),
  constituents: z.array(z.object({ variantId: z.string(), values: z.array(ConstituentSchema) })),
  deliveryNote: z.string().nullable(),
  sizeGuideId: z.string().nullable(),
});
export type AdminProductContent = z.infer<typeof AdminProductContentSchema>;
export const AdminProductContentResponseSchema = DataSchema(AdminProductContentSchema);

// ---------- size guides ----------

export const AdminSizeGuideInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2, 'At least 2 characters')
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lower-case letters, numbers and dashes only'),
    title: z.string().trim().min(1, 'Required').max(80),
    table: SizeGuideTableSchema,
    howtoMd: z.string().max(3000, 'At most 3000 characters').default(''),
    tip: optionalText(120).transform((v) => v ?? null),
  })
  .superRefine((guide, ctx) => {
    guide.table.rows.forEach((row, i) => {
      if (row.values.length !== guide.table.columns.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['table', 'rows', i, 'values'],
          message: 'Every row needs one value per column',
        });
      }
    });
    const sizes = new Set<string>();
    guide.table.rows.forEach((row, i) => {
      if (sizes.has(row.size)) {
        ctx.addIssue({
          code: 'custom',
          path: ['table', 'rows', i, 'size'],
          message: 'This size is used twice',
        });
      }
      sizes.add(row.size);
    });
  });
export type AdminSizeGuideInput = z.input<typeof AdminSizeGuideInputSchema>;

export const AdminSizeGuideSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  table: SizeGuideTableSchema,
  howtoMd: z.string(),
  tip: z.string().nullable(),
  productCount: z.number().int().min(0),
});
export type AdminSizeGuide = z.infer<typeof AdminSizeGuideSchema>;
export const AdminSizeGuideResponseSchema = DataSchema(AdminSizeGuideSchema);
export const AdminSizeGuideListResponseSchema = DataSchema(z.array(AdminSizeGuideSchema));
export const AdminSizeGuideDeleteResponseSchema = DataSchema(
  z.object({ detachedProducts: z.number().int().min(0) }),
);
