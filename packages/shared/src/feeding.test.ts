import { describe, expect, it } from 'vitest';

import {
  calculateFeeding,
  costPerDayCents,
  daysPerBag,
  FeedingTableInputSchema,
  findBandProblems,
  packForDays,
  rowsForStage,
  type FeedingRow,
} from './feeding.ts';

const row = (
  min: number,
  max: number,
  dailyG = 50,
  lifeStage: FeedingRow['lifeStage'] = 'any',
) => ({
  petWeightGMin: min,
  petWeightGMax: max,
  dailyG,
  lifeStage,
});

describe('findBandProblems', () => {
  it('accepts bands that meet edge to edge, in any input order', () => {
    expect(findBandProblems([row(5000, 10000), row(1000, 5000), row(10000, 20000)])).toEqual([]);
  });

  it('accepts an empty table and a single band', () => {
    expect(findBandProblems([])).toEqual([]);
    expect(findBandProblems([row(0, 1000)])).toEqual([]);
  });

  it('reports an overlap on the later band, by its index as given', () => {
    const problems = findBandProblems([row(1000, 6000), row(5000, 10000)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ index: 1, kind: 'overlap', lifeStage: 'any' });
    expect(problems[0]?.message).toContain('1 kg to 6 kg');
  });

  it('reports a gap between neighbours', () => {
    const problems = findBandProblems([row(1000, 5000), row(6500, 10000)]);
    expect(problems[0]).toMatchObject({ index: 1, kind: 'gap' });
    expect(problems[0]?.message).toBe('Gap between 5 kg and 6.5 kg');
  });

  it('treats a band that starts exactly where the last ended as fine (half-open)', () => {
    expect(findBandProblems([row(0, 1), row(1, 2)])).toEqual([]);
  });

  it('checks every life stage on its own', () => {
    // Puppy and adult tables overlap each other in range, which is fine; each tiles by itself.
    const rows = [
      row(1000, 5000, 20, 'puppy'),
      row(5000, 9000, 30, 'puppy'),
      row(2000, 8000, 25, 'adult'),
    ];
    expect(findBandProblems(rows)).toEqual([]);
    expect(findBandProblems([...rows, row(7000, 9000, 25, 'adult')])).toHaveLength(1);
  });

  it('lists every problem, not only the first', () => {
    const problems = findBandProblems([row(0, 5), row(3, 8), row(20, 30)]);
    expect(problems.map((p) => p.kind)).toEqual(['overlap', 'gap']);
  });
});

describe('FeedingTableInputSchema', () => {
  it('parses a tidy table', () => {
    expect(FeedingTableInputSchema.safeParse([row(0, 5000), row(5000, 9000)]).success).toBe(true);
  });

  it('puts a gap or overlap on the offending row, under its lower weight', () => {
    const result = FeedingTableInputSchema.safeParse([row(0, 5000), row(5500, 9000)]);
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual([1, 'petWeightGMin']);
    expect(issue?.message).toMatch(/^Gap/);
  });

  it('refuses an upper weight not above the lower one, and zero or float grams', () => {
    expect(FeedingTableInputSchema.safeParse([row(5000, 5000)]).success).toBe(false);
    expect(FeedingTableInputSchema.safeParse([row(0, 5000, 0)]).success).toBe(false);
    expect(FeedingTableInputSchema.safeParse([row(0, 5000, 12.5)]).success).toBe(false);
  });
});

// Bands: 1-5 kg (mid 3 kg) 15 g, 5-10 kg (mid 7.5 kg) 30 g, 10-20 kg (mid 15 kg) 50 g.
const TABLE: FeedingRow[] = [row(1000, 5000, 15), row(5000, 10000, 30), row(10000, 20000, 50)];

describe('calculateFeeding', () => {
  it('returns the band amount exactly at a band midpoint', () => {
    expect(calculateFeeding(TABLE, { weightG: 3000, lifeStage: 'any' })?.dailyG).toBe(15);
    expect(calculateFeeding(TABLE, { weightG: 7500, lifeStage: 'any' })?.dailyG).toBe(30);
    expect(calculateFeeding(TABLE, { weightG: 15000, lifeStage: 'any' })?.dailyG).toBe(50);
  });

  it('interpolates in a straight line between neighbouring midpoints', () => {
    // Halfway between 3 kg (15 g) and 7.5 kg (30 g) is 5.25 kg -> 22.5 g -> rounds half up to 23.
    expect(calculateFeeding(TABLE, { weightG: 5250, lifeStage: 'any' })?.dailyG).toBe(23);
    // A quarter of the way: 3 kg + 1.125 kg = 4.125 kg -> 15 + 3.75 = 18.75 -> 19.
    expect(calculateFeeding(TABLE, { weightG: 4125, lifeStage: 'any' })?.dailyG).toBe(19);
  });

  it('stays flat below the first midpoint and above the last, inside the table', () => {
    expect(calculateFeeding(TABLE, { weightG: 1000, lifeStage: 'any' })?.dailyG).toBe(15);
    expect(calculateFeeding(TABLE, { weightG: 19999, lifeStage: 'any' })?.dailyG).toBe(50);
  });

  it('is monotonic when the table is: a heavier pet never gets less', () => {
    let previous = 0;
    for (let weightG = 1000; weightG < 20000; weightG += 37) {
      const daily = calculateFeeding(TABLE, { weightG, lifeStage: 'any' })?.dailyG ?? 0;
      expect(daily).toBeGreaterThanOrEqual(previous);
      previous = daily;
    }
  });

  it('handles a table that goes down with weight (negative slope) with the same rounding', () => {
    const falling = [row(0, 2000, 40), row(2000, 4000, 20)];
    // Midpoints 1 kg (40 g) and 3 kg (20 g); at 2 kg: 40 - 10 = 30 exactly.
    expect(calculateFeeding(falling, { weightG: 2000, lifeStage: 'any' })?.dailyG).toBe(30);
    // At 2.1 kg: 40 + round_half_up(-20 * 1100 / 2000) = 40 - 11 = 29.
    expect(calculateFeeding(falling, { weightG: 2100, lifeStage: 'any' })?.dailyG).toBe(29);
  });

  it('clamps outside the table to its edge and says so', () => {
    const light = calculateFeeding(TABLE, { weightG: 500, lifeStage: 'any' });
    expect(light).toMatchObject({ dailyG: 15, clamped: 'below', usedWeightG: 1000 });
    const heavy = calculateFeeding(TABLE, { weightG: 20000, lifeStage: 'any' });
    expect(heavy).toMatchObject({ dailyG: 50, clamped: 'above', usedWeightG: 19999 });
    expect(heavy).toMatchObject({ coversFromG: 1000, coversToG: 20000 });
    expect(calculateFeeding(TABLE, { weightG: 3000, lifeStage: 'any' })?.clamped).toBeNull();
  });

  it('treats the lower edge as inside and the upper edge as outside (half-open bands)', () => {
    expect(calculateFeeding(TABLE, { weightG: 1000, lifeStage: 'any' })?.clamped).toBeNull();
    expect(calculateFeeding(TABLE, { weightG: 19999, lifeStage: 'any' })?.clamped).toBeNull();
    expect(calculateFeeding(TABLE, { weightG: 20000, lifeStage: 'any' })?.clamped).toBe('above');
  });

  it('splits the day into meals and rounds each meal half up', () => {
    const r = calculateFeeding(TABLE, { weightG: 7500, lifeStage: 'any' });
    expect(r).toMatchObject({ dailyG: 30, portions: 2, gramsPerPortion: 15 });
    // 23 g over 2 meals = 11.5 -> 12.
    expect(calculateFeeding(TABLE, { weightG: 5250, lifeStage: 'any', portions: 2 })).toMatchObject(
      {
        dailyG: 23,
        gramsPerPortion: 12,
      },
    );
    expect(
      calculateFeeding(TABLE, { weightG: 7500, lifeStage: 'any', portions: 1 })?.gramsPerPortion,
    ).toBe(30);
    expect(
      calculateFeeding(TABLE, { weightG: 7500, lifeStage: 'any', portions: 3 })?.gramsPerPortion,
    ).toBe(10);
  });

  it('uses the life stage table when there is one and falls back to the all-stages table', () => {
    const rows = [row(1000, 5000, 20, 'puppy'), row(1000, 5000, 10, 'any')];
    expect(calculateFeeding(rows, { weightG: 3000, lifeStage: 'puppy' })).toMatchObject({
      dailyG: 20,
      lifeStage: 'puppy',
    });
    expect(calculateFeeding(rows, { weightG: 3000, lifeStage: 'senior' })).toMatchObject({
      dailyG: 10,
      lifeStage: 'any',
    });
    expect(rowsForStage(rows, 'adult').map((r) => r.dailyG)).toEqual([10]);
  });

  it('answers null for no table, a stage with nothing to fall back on, or a bad weight', () => {
    expect(calculateFeeding([], { weightG: 3000, lifeStage: 'any' })).toBeNull();
    expect(
      calculateFeeding([row(0, 5000, 10, 'puppy')], { weightG: 3000, lifeStage: 'adult' }),
    ).toBeNull();
    for (const weightG of [0, -5, 12.5, Number.NaN]) {
      expect(calculateFeeding(TABLE, { weightG, lifeStage: 'any' })).toBeNull();
    }
    expect(calculateFeeding(TABLE, { weightG: 3000, lifeStage: 'any', portions: 0 })).toBeNull();
  });

  it('is deterministic', () => {
    const a = calculateFeeding(TABLE, { weightG: 6789, lifeStage: 'any' });
    expect(calculateFeeding(TABLE, { weightG: 6789, lifeStage: 'any' })).toEqual(a);
  });
});

describe('bag maths', () => {
  it('counts whole days a bag lasts', () => {
    expect(daysPerBag(1000, 50)).toBe(20);
    expect(daysPerBag(1000, 30)).toBe(33);
    expect(daysPerBag(100, 150)).toBe(0);
    expect(daysPerBag(1000, 0)).toBe(0);
    expect(daysPerBag(1000.5, 50)).toBe(0);
  });

  it('prices a day of feeding in integer cents, rounded half up', () => {
    // 1299 cents for 1000 g at 65 g a day = 84.435 -> 84.
    expect(costPerDayCents(1299, 1000, 65)).toBe(84);
    // 1000 cents for 400 g at 1 g a day = 2.5 -> 3 (half up).
    expect(costPerDayCents(1000, 400, 1)).toBe(3);
    expect(costPerDayCents(0, 1000, 50)).toBe(0);
    expect(costPerDayCents(1299, 0, 50)).toBe(0);
    expect(costPerDayCents(12.5, 1000, 50)).toBe(0);
  });

  it('picks the smallest pack that lasts the days, else the biggest', () => {
    const packs = [
      { id: 'a', packG: 500 },
      { id: 'c', packG: 2000 },
      { id: 'b', packG: 1000 },
    ];
    // 40 g a day: 500 g = 12 days, 1000 g = 25, 2000 g = 50 -> 2000 g is the first to reach 30.
    expect(packForDays(packs, 40, 30)?.id).toBe('c');
    expect(packForDays(packs, 20, 30)?.id).toBe('b');
    expect(packForDays(packs, 200, 30)?.id).toBe('c');
    expect(packForDays([], 40, 30)).toBeNull();
    expect(packForDays(packs, 0, 30)).toBeNull();
  });
});
