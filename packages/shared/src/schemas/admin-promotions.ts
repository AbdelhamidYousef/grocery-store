import { z } from 'zod';

import { DataSchema } from './common.ts';

// Back-office contract for discount codes, bulk tiers and the gift rule. The database has check
// constraints for the same rules; these schemas give a person the sentence before the database does.

const Cents = z.number().int();
const Iso = z.iso.datetime({ offset: true });

export const DiscountKindSchema = z.enum(['percent', 'fixed', 'free_shipping']);
export type DiscountKind = z.infer<typeof DiscountKindSchema>;

const optionalCap = (label: string) =>
  z
    .number()
    .int(`${label} must be a whole number`)
    .positive(`${label} must be above 0, or empty for no limit`)
    .nullable();

export const AdminDiscountCodeInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'A code needs at least 3 characters')
      .max(40, 'A code can have at most 40 characters')
      .regex(/^[A-Za-z0-9_-]+$/, 'Codes are letters, numbers, - and _ only'),
    kind: DiscountKindSchema,
    // percent: 1..100. fixed: cents. free_shipping: 0.
    value: Cents,
    minSpendCents: Cents.min(0, 'The minimum spend cannot be negative').default(0),
    startsAt: Iso.nullable().default(null),
    endsAt: Iso.nullable().default(null),
    maxUses: optionalCap('Total uses').default(null),
    perCustomerMax: optionalCap('Uses per customer').default(null),
    excludeSaleItems: z.boolean().default(false),
    firstOrderOnly: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'percent' && (v.value < 1 || v.value > 100)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage is 1 to 100' });
    }
    if (v.kind === 'fixed' && v.value <= 0) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'The amount must be above 0' });
    }
    if (v.kind === 'free_shipping' && v.value !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Free shipping has no value',
      });
    }
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must be after the start',
      });
    }
  });
export type AdminDiscountCodeInput = z.input<typeof AdminDiscountCodeInputSchema>;
export type AdminDiscountCodeParsed = z.output<typeof AdminDiscountCodeInputSchema>;

export const AdminDiscountCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: DiscountKindSchema,
  value: Cents,
  minSpendCents: Cents,
  startsAt: Iso.nullable(),
  endsAt: Iso.nullable(),
  maxUses: Cents.nullable(),
  perCustomerMax: Cents.nullable(),
  excludeSaleItems: z.boolean(),
  firstOrderOnly: z.boolean(),
  active: z.boolean(),
  archivedAt: Iso.nullable(),
  // Redemption rows that are not released: what the usage cap counts.
  liveRedemptions: Cents,
  createdAt: Iso,
});
export type AdminDiscountCode = z.infer<typeof AdminDiscountCodeSchema>;

export const AdminDiscountCodeListResponseSchema = DataSchema(z.array(AdminDiscountCodeSchema));
export const AdminDiscountCodeResponseSchema = DataSchema(AdminDiscountCodeSchema);

// DELETE answers what it did: a code that was ever redeemed is archived, never removed.
export const AdminDiscountCodeDeleteResponseSchema = DataSchema(
  z.object({ outcome: z.enum(['deleted', 'archived']) }),
);
export type AdminDiscountCodeDeleteResponse = z.infer<typeof AdminDiscountCodeDeleteResponseSchema>;

// ----- bulk tiers -----
export const AdminBulkTierInputSchema = z.object({
  minCents: Cents.positive('The threshold must be above 0'),
  percent: Cents.min(1, 'A percentage is 1 to 100').max(100, 'A percentage is 1 to 100'),
  active: z.boolean().default(true),
});
export type AdminBulkTierInput = z.input<typeof AdminBulkTierInputSchema>;

export const AdminBulkTierSchema = z.object({
  id: z.string(),
  minCents: Cents,
  percent: Cents,
  active: z.boolean(),
});
export type AdminBulkTier = z.infer<typeof AdminBulkTierSchema>;
export const AdminBulkTierListResponseSchema = DataSchema(z.array(AdminBulkTierSchema));
export const AdminBulkTierResponseSchema = DataSchema(AdminBulkTierSchema);

// ----- gift rule -----
export const AdminGiftRuleInputSchema = z.object({
  thresholdCents: Cents.positive('The threshold must be above 0'),
  // A SKU or a variant id.
  variant: z.string().trim().min(1, 'Enter the gift variant SKU').max(80),
});
export type AdminGiftRuleInput = z.input<typeof AdminGiftRuleInputSchema>;

export const AdminGiftRuleSchema = z.object({
  id: z.string(),
  thresholdCents: Cents,
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  variantName: z.string(),
});
export type AdminGiftRule = z.infer<typeof AdminGiftRuleSchema>;
export const AdminGiftRuleResponseSchema = DataSchema(AdminGiftRuleSchema.nullable());
