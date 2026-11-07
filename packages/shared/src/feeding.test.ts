import { describe, expect, it } from 'vitest';

import { FeedingTableInputSchema, findBandProblems, type FeedingRow } from './feeding.ts';

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
