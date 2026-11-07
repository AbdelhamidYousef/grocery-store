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

// ---------------------------------------------------------------------------------------------
// The calculator. Integer arithmetic only: grams in, grams out, cents for money.
// ---------------------------------------------------------------------------------------------

/** round_half_up(a / b) for integer a and integer b > 0 (a may be negative). */
function divRoundHalfUp(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

export interface FeedingInput {
  /** Pet weight in grams. */
  weightG: number;
  lifeStage: LifeStage;
  /** Meals a day; 2 unless the shopper (or an adult cat's plan) says otherwise. */
  portions?: number;
}

export interface FeedingResult {
  /** Daily amount in grams, interpolated between the midpoints of neighbouring bands. */
  dailyG: number;
  portions: number;
  /** Per meal, rounded half up (so the meals can differ from the day by a gram). */
  gramsPerPortion: number;
  /** Set when the weight is outside the table: the weight is clamped to its edge. The UI must say so. */
  clamped: 'below' | 'above' | null;
  /** The weight the maths used (after clamping). */
  usedWeightG: number;
  /** The table the answer came from: the life stage asked for, or `any` when it has none. */
  lifeStage: LifeStage;
  /** Range of weights the table covers, for the UI's wording. */
  coversFromG: number;
  coversToG: number;
}

/** The rows that apply to a life stage: its own table, else the all-stages one, else nothing. */
export function rowsForStage(rows: readonly FeedingRow[], stage: LifeStage): FeedingRow[] {
  const own = rows.filter((r) => r.lifeStage === stage);
  const table = own.length > 0 ? own : rows.filter((r) => r.lifeStage === 'any');
  return [...table].sort((a, b) => a.petWeightGMin - b.petWeightGMin);
}

/**
 * Daily feeding for a pet weight. Each band is represented by its MIDPOINT (the weight at the
 * middle of the band, rounded half up), and between two neighbouring midpoints the daily amount
 * moves in a straight line, so a pet 1 g heavier never jumps by a whole band's difference. Below
 * the first midpoint and above the last, the amount stays flat. A weight outside the table is
 * clamped to its edge and flagged (`clamped`); it is never silently guessed.
 *
 * Returns null when the product has no usable table or the weight is not a positive integer.
 */
export function calculateFeeding(
  rows: readonly FeedingRow[],
  { weightG, lifeStage, portions = 2 }: FeedingInput,
): FeedingResult | null {
  if (!Number.isInteger(weightG) || weightG <= 0) return null;
  if (!Number.isInteger(portions) || portions < 1) return null;
  const table = rowsForStage(rows, lifeStage);
  const first = table[0];
  const last = table[table.length - 1];
  if (!first || !last) return null;

  const coversFromG = first.petWeightGMin;
  // The upper edge is exclusive, so the heaviest weight the table covers is one gram less.
  const coversToG = last.petWeightGMax;
  let clamped: FeedingResult['clamped'] = null;
  let used = weightG;
  if (weightG < coversFromG) {
    clamped = 'below';
    used = coversFromG;
  } else if (weightG >= coversToG) {
    clamped = 'above';
    used = coversToG - 1;
  }

  const points = table.map((r) => ({
    at: divRoundHalfUp(r.petWeightGMin + r.petWeightGMax, 2),
    dailyG: r.dailyG,
  }));
  let dailyG = points[0]?.dailyG ?? first.dailyG;
  if (used >= (points[points.length - 1]?.at ?? 0)) {
    dailyG = points[points.length - 1]?.dailyG ?? last.dailyG;
  } else if (used > (points[0]?.at ?? 0)) {
    for (let i = 1; i < points.length; i++) {
      const lo = points[i - 1];
      const hi = points[i];
      if (!lo || !hi || used > hi.at) continue;
      dailyG = lo.dailyG + divRoundHalfUp((hi.dailyG - lo.dailyG) * (used - lo.at), hi.at - lo.at);
      break;
    }
  }

  return {
    dailyG,
    portions,
    gramsPerPortion: divRoundHalfUp(dailyG, portions),
    clamped,
    usedWeightG: used,
    lifeStage: table[0]?.lifeStage ?? lifeStage,
    coversFromG,
    coversToG,
  };
}

/** Whole days a pack lasts at a daily amount (the last partial day is not counted). */
export function daysPerBag(packG: number, dailyG: number): number {
  if (!Number.isInteger(packG) || !Number.isInteger(dailyG) || packG <= 0 || dailyG <= 0) return 0;
  return Math.floor(packG / dailyG);
}

/** What a day of feeding costs, in cents, rounded half up: price * dailyG / packG. */
export function costPerDayCents(priceCents: number, packG: number, dailyG: number): number {
  if (!Number.isInteger(priceCents) || !Number.isInteger(packG) || !Number.isInteger(dailyG)) {
    return 0;
  }
  if (packG <= 0 || dailyG <= 0 || priceCents < 0) return 0;
  return divRoundHalfUp(priceCents * dailyG, packG);
}

/**
 * Of the candidate packs, the smallest one that lasts at least `days`; if none does, the biggest
 * (the closest the shop can get). Candidates are { id, packG }. Null for an empty list.
 */
export function packForDays<T extends { packG: number }>(
  candidates: readonly T[],
  dailyG: number,
  days: number,
): T | null {
  if (candidates.length === 0 || dailyG <= 0) return null;
  const sorted = [...candidates].sort((a, b) => a.packG - b.packG);
  return (
    sorted.find((c) => daysPerBag(c.packG, dailyG) >= days) ?? sorted[sorted.length - 1] ?? null
  );
}
