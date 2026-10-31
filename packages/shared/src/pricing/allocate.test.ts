import { describe, expect, it } from 'vitest';

import { allocate } from './allocate.ts';

describe('allocate (largest remainder)', () => {
  const cases: { name: string; total: number; weights: number[]; expected: number[] }[] = [
    { name: 'empty weights', total: 0, weights: [], expected: [] },
    { name: 'zero total', total: 0, weights: [5, 5], expected: [0, 0] },
    { name: 'even split', total: 10, weights: [1, 1], expected: [5, 5] },
    {
      name: '10 over three equal lines: first gets the extra cent',
      total: 10,
      weights: [33, 33, 33],
      expected: [4, 3, 3],
    },
    {
      name: '2 over three equal lines: ties go to the earlier index',
      total: 2,
      weights: [1, 1, 1],
      expected: [1, 1, 0],
    },
    { name: 'largest remainder wins over index', total: 1, weights: [1, 2], expected: [0, 1] },
    {
      name: 'zero-weight lines get nothing',
      total: 7,
      weights: [0, 3, 0, 4],
      expected: [0, 3, 0, 4],
    },
    { name: 'single line takes everything', total: 99, weights: [500], expected: [99] },
  ];
  it.each(cases)('$name', ({ total, weights, expected }) => {
    expect(allocate(total, weights)).toEqual(expected);
  });

  it('rejects a positive total over zero weight', () => {
    expect(() => allocate(5, [0, 0])).toThrow(RangeError);
    expect(() => allocate(5, [])).not.toThrow();
  });

  it('rejects negatives and fractions', () => {
    expect(() => allocate(-1, [1])).toThrow(RangeError);
    expect(() => allocate(1.5, [1])).toThrow(RangeError);
    expect(() => allocate(1, [-1, 2])).toThrow(RangeError);
  });

  it('always sums exactly to the total (seeded random)', () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let k = 0; k < 500; k++) {
      const weights = Array.from({ length: 1 + rnd(6) }, () => rnd(5000));
      const sum = weights.reduce((a, b) => a + b, 0);
      if (sum === 0) continue;
      const total = rnd(sum + 1);
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, i) => expect(p).toBeLessThanOrEqual(weights[i]!));
    }
  });
});
