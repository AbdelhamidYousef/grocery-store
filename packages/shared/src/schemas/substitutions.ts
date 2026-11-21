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

// ---------- the shopper's answer to a swap ----------

export const SwapParamsSchema = z.object({
  number: z.string().regex(/^(GR|PW)-\d{4}-\d{6,}$/, 'Not an order number'),
  itemId: z.uuid(),
});

// Signed in as the owner, or the token from the email link; the owner needs no token.
export const SwapDecisionSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  token: z.string().trim().min(1).max(200).optional(),
});
export type SwapDecisionInput = z.input<typeof SwapDecisionSchema>;

export const SwapAnswerSchema = z.object({
  orderNumber: z.string(),
  itemId: z.string(),
  swapStatus: z.enum(['accepted', 'rejected']),
});
export type SwapAnswer = z.infer<typeof SwapAnswerSchema>;
export const SwapAnswerResponseSchema = DataSchema(SwapAnswerSchema);

// ---------- admin: the packer's shortfall and the door ----------

export const AdminShortfallParamsSchema = z.object({
  number: z.string().regex(/^(GR|PW)-\d{4}-\d{6,}$/, 'Not an order number'),
  itemId: z.uuid(),
});

export const AdminShortfallSchema = z.object({
  // Units found: 0 up to quantity - 1 (all found is not a shortfall).
  pickedQty: z.number().int().min(0).max(999),
  substituteVariantId: z.uuid().optional(),
});
export type AdminShortfallInput = z.input<typeof AdminShortfallSchema>;

export const AdminShortfallResultSchema = z.object({
  orderNumber: z.string(),
  originalItemId: z.string(),
  substituteItemId: z.string().nullable(),
  pickStatus: z.enum(['short', 'missing', 'substituted']),
});
export const AdminShortfallResponseSchema = DataSchema(AdminShortfallResultSchema);

export const AdminDoorResultSchema = z.object({
  orderNumber: z.string(),
  itemId: z.string(),
  refundedCents: z.number().int().min(0),
  alreadyRefunded: z.boolean(),
});
export const AdminDoorResponseSchema = DataSchema(AdminDoorResultSchema);
