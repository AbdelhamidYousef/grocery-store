import { z } from 'zod';

import { TIER_IDS } from '../loyalty.ts';

import { DataSchema } from './common.ts';

export const TierIdSchema = z.enum(TIER_IDS);

export const PointKindSchema = z.enum(['earn', 'redeem', 'reversal', 'bonus', 'donate', 'adjust']);
export type PointKind = z.infer<typeof PointKindSchema>;

export const PointsEntrySchema = z.object({
  id: z.string(),
  delta: z.number().int(),
  kind: PointKindSchema,
  orderNumber: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type PointsEntry = z.infer<typeof PointsEntrySchema>;

export const PointsSummarySchema = z.object({
  balance: z.number().int(),
  lifetimeEarned: z.number().int().min(0),
  tier: z.object({
    id: TierIdSchema,
    label: z.string(),
    ratePercent: z.number().int(),
  }),
  nextTier: z
    .object({ id: TierIdSchema, label: z.string(), pointsNeeded: z.number().int().positive() })
    .nullable(),
  entries: z.array(PointsEntrySchema),
});
export type PointsSummary = z.infer<typeof PointsSummarySchema>;
export const PointsResponseSchema = DataSchema(PointsSummarySchema);
export type PointsResponse = z.infer<typeof PointsResponseSchema>;

// Admin: add an `adjust` row. The reason is mandatory: it is the only audit trail for a manual
// change to somebody's balance.
export const AdminPointsAdjustSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Must not be zero')
    .refine((n) => Math.abs(n) <= 100_000, 'Too large'),
  reason: z.string().trim().min(3).max(200),
});
export type AdminPointsAdjust = z.infer<typeof AdminPointsAdjustSchema>;
export const AdminPointsAdjustResponseSchema = DataSchema(
  z.object({ balance: z.number().int(), entry: PointsEntrySchema }),
);

// ---------- rewards shop (19.4) ----------

export const RewardKindSchema = z.enum(['coupon_fixed', 'free_shipping', 'gift']);
export type RewardKind = z.infer<typeof RewardKindSchema>;

export const RewardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  costPoints: z.number().int().positive(),
  kind: RewardKindSchema,
  // Cents; 0 for free shipping.
  valueCents: z.number().int().min(0),
});
export type Reward = z.infer<typeof RewardSchema>;
export const RewardListResponseSchema = DataSchema(z.array(RewardSchema));

export const AdminRewardSchema = RewardSchema.extend({ active: z.boolean() });
export type AdminReward = z.infer<typeof AdminRewardSchema>;
export const AdminRewardListResponseSchema = DataSchema(z.array(AdminRewardSchema));
export const AdminRewardResponseSchema = DataSchema(AdminRewardSchema);

export const AdminRewardInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Required').max(80),
    description: z.string().trim().max(200).default(''),
    costPoints: z.number().int().min(1).max(1_000_000),
    kind: RewardKindSchema,
    valueCents: z.number().int().min(0).max(1_000_000),
    active: z.boolean().default(true),
  })
  .refine((r) => (r.kind === 'free_shipping' ? r.valueCents === 0 : r.valueCents > 0), {
    message: 'Free shipping has no value; every other reward needs one',
    path: ['valueCents'],
  });
export type AdminRewardInput = z.input<typeof AdminRewardInputSchema>;

export const PersonalCodeSchema = z.object({
  code: z.string(),
  kind: z.enum(['percent', 'fixed', 'free_shipping']),
  value: z.number().int().min(0),
  minSpendCents: z.number().int().min(0),
  endsAt: z.string().nullable(),
  used: z.boolean(),
});
export type PersonalCode = z.infer<typeof PersonalCodeSchema>;
export const PersonalCodeListResponseSchema = DataSchema(z.array(PersonalCodeSchema));

export const RedeemRewardResponseSchema = DataSchema(
  z.object({ code: PersonalCodeSchema, balance: z.number().int() }),
);
export type RedeemRewardResponse = z.infer<typeof RedeemRewardResponseSchema>;

// ---------- charity (19.5) ----------

export const CharityTotalSchema = z.object({
  charity: z.object({ slug: z.string(), name: z.string(), description: z.string() }),
  // Everything donated so far (points and round-ups, minus reversed round-ups). DEMO: no money moves.
  totalCents: z.number().int().min(0),
  donations: z.number().int().min(0),
});
export type CharityTotal = z.infer<typeof CharityTotalSchema>;
export const CharityTotalResponseSchema = DataSchema(CharityTotalSchema);

export const DonatePointsSchema = z.object({
  points: z.number().int().min(1).max(1_000_000),
});
export type DonatePoints = z.infer<typeof DonatePointsSchema>;
export const DonatePointsResponseSchema = DataSchema(
  z.object({ balance: z.number().int(), donatedCents: z.number().int().positive() }),
);
