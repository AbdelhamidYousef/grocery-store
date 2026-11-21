import { z } from 'zod';

import { SubstitutionPreferenceSchema } from '../substitutions.ts';

import { DataSchema } from './common.ts';

// ---------- the choice on a cart line ----------

// "Choose a product" needs the product; the other two need none.
export const SetSubstitutionSchema = z
  .object({
    substitution: SubstitutionPreferenceSchema,
    substituteVariantId: z.uuid().optional(),
  })
  .refine((v) => (v.substitution === 'specific') === (v.substituteVariantId !== undefined), {
    message: 'Choose a product for "specific", and only then',
    path: ['substituteVariantId'],
  });
export type SetSubstitutionInput = z.input<typeof SetSubstitutionSchema>;

// "Apply to all lines": a specific product belongs to one line, so only the other two.
export const ApplySubstitutionToAllSchema = z.object({
  substitution: z.enum(['best_match', 'none']),
});
export type ApplySubstitutionToAllInput = z.input<typeof ApplySubstitutionToAllSchema>;

// The account preference new lines start with.
export const SubstitutionSettingsSchema = z.object({
  defaultSubstitution: z.enum(['best_match', 'none']),
});
export type SubstitutionSettings = z.infer<typeof SubstitutionSettingsSchema>;
export const SubstitutionSettingsResponseSchema = DataSchema(SubstitutionSettingsSchema);

// ---------- the best-match list ----------

export const SubstitutesQuerySchema = z.object({ variantId: z.uuid().optional() });

export const SubstituteOptionSchema = z.object({
  variantId: z.string(),
  productSlug: z.string(),
  productName: z.string(),
  variantName: z.string(),
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable(),
  unitPriceCents: z.number().int().min(0),
});
export type SubstituteOption = z.infer<typeof SubstituteOptionSchema>;
export const SubstitutesResponseSchema = DataSchema(z.array(SubstituteOptionSchema));
