import { z } from 'zod';

// Feeding guide data and its rules. Pure functions: the clock-free, DB-free core that the admin
// form, the API and the calculator (step 16.4) all share.

export const LIFE_STAGES = ['puppy', 'adult', 'senior', 'any'] as const;
export const LifeStageSchema = z.enum(LIFE_STAGES);
export type LifeStage = z.infer<typeof LifeStageSchema>;

// A band covers min <= weight < max, in grams of pet weight. Half-open on purpose: the next band
// starts exactly where this one ends, so "no overlap, no gap" is one equality per neighbour.
export const FeedingRowSchema = z
  .object({
    petWeightGMin: z.number().int().min(0).max(200_000),
    petWeightGMax: z.number().int().min(1).max(200_000),
    dailyG: z.number().int().min(1).max(5_000),
    lifeStage: LifeStageSchema,
  })
  .refine((r) => r.petWeightGMax > r.petWeightGMin, {
    message: 'The upper weight must be above the lower weight',
    path: ['petWeightGMax'],
  });
export type FeedingRow = z.infer<typeof FeedingRowSchema>;

export interface BandProblem {
  /** Index into the rows array as given (not the sorted order), so a form can mark the row. */
  index: number;
  lifeStage: LifeStage;
  kind: 'overlap' | 'gap';
  message: string;
}

const kgText = (g: number) => `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg`;

/**
 * Bands of one life stage must tile a weight range: sorted by lower bound, each starts exactly
 * where the previous ends. Different life stages are independent tables (a puppy table and an
 * adult table may cover different ranges). Returns every problem, so a form can show them all.
 */
export function findBandProblems(
  rows: readonly Pick<FeedingRow, 'petWeightGMin' | 'petWeightGMax' | 'lifeStage'>[],
): BandProblem[] {
  const problems: BandProblem[] = [];
  for (const stage of LIFE_STAGES) {
    const sorted = rows
      .map((row, index) => ({ row, index }))
      .filter((r) => r.row.lifeStage === stage)
      .sort((a, b) => a.row.petWeightGMin - b.row.petWeightGMin || a.index - b.index);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      if (cur.row.petWeightGMin < prev.row.petWeightGMax) {
        problems.push({
          index: cur.index,
          lifeStage: stage,
          kind: 'overlap',
          message: `Overlaps the band ${kgText(prev.row.petWeightGMin)} to ${kgText(prev.row.petWeightGMax)}`,
        });
      } else if (cur.row.petWeightGMin > prev.row.petWeightGMax) {
        problems.push({
          index: cur.index,
          lifeStage: stage,
          kind: 'gap',
          message: `Gap between ${kgText(prev.row.petWeightGMax)} and ${kgText(cur.row.petWeightGMin)}`,
        });
      }
    }
  }
  return problems;
}

// The list schema the admin API validates a whole feeding table with.
export const FeedingTableInputSchema = z
  .array(FeedingRowSchema)
  .max(40)
  .superRefine((rows, ctx) => {
    for (const p of findBandProblems(rows)) {
      ctx.addIssue({ code: 'custom', message: p.message, path: [p.index, 'petWeightGMin'] });
    }
  });
