import { describe, expect, it } from 'vitest';

import { averageTenths, reviewInputSchema } from './reviews.ts';

const valid = {
  rating: 5,
  title: 'Brilliant bed',
  body: 'My dog sleeps in it every single night and it still looks new.',
  wouldRecommend: true,
};

describe('reviewInputSchema', () => {
  it('accepts a minimal review', () => {
    expect(reviewInputSchema.safeParse(valid).success).toBe(true);
  });

  it('reads multipart strings: numbers and booleans', () => {
    const r = reviewInputSchema.parse({
      ...valid,
      rating: '4',
      petAgeMonths: '18',
      petWeightG: '4500',
      sizePurchased: '',
      wouldRecommend: 'false',
    });
    expect(r).toMatchObject({
      rating: 4,
      petAgeMonths: 18,
      petWeightG: 4500,
      wouldRecommend: false,
    });
    expect(r.sizePurchased).toBeUndefined();
  });

  it.each([
    ['rating 0', { rating: 0 }],
    ['rating 6', { rating: 6 }],
    ['fractional rating', { rating: 4.5 }],
    ['short title', { title: 'ok' }],
    ['short body', { body: 'too short' }],
    ['long body', { body: 'x'.repeat(2001) }],
    ['fractional weight', { petWeightG: 4.5 }],
    ['negative age', { petAgeMonths: -1 }],
    ['absurd weight', { petWeightG: 999_999 }],
  ])('rejects %s', (_name, patch) => {
    expect(reviewInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe('averageTenths', () => {
  it.each([
    [0, 0, 0],
    [1, 5, 50],
    [4, 18, 45],
    [3, 14, 47],
    [3, 13, 43],
    [2, 9, 45],
  ])('count %i, sum %i -> %i', (count, sum, expected) => {
    expect(averageTenths(count, sum)).toBe(expected);
  });
});
