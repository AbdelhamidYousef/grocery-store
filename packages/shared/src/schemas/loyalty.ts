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
