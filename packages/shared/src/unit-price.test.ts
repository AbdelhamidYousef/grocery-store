import { describe, expect, it } from 'vitest';

import { unitPriceCents } from './unit-price.ts';

describe('unitPriceCents', () => {
  it.each([
    // [price, net, unit, expected cents, per]
    [420, 1000, 'g', 420, 'kg'],
    [599, 150, 'g', 3993, 'kg'], // 3993.33 rounds down
    [1000, 3000, 'g', 333, 'kg'], // 333.33 rounds down
    [1000, 6000, 'g', 167, 'kg'], // 166.67 rounds up
    [1, 8, 'g', 125, 'kg'], // exactly 125
    [3, 8, 'g', 375, 'kg'],
    [999, 500, 'ml', 1998, 'L'],
  ] as const)('%i cents for %i %s is %i cents per %s', (price, net, unit, cents, per) => {
    expect(unitPriceCents(price, net, unit)).toEqual({ cents, per });
  });

  it('rounds a half cent up (x.5)', () => {
    // 1 cent / 16 g = 62.5 per kg; 5 / 16 = 312.5; both go up.
    expect(unitPriceCents(1, 16, 'g')?.cents).toBe(63);
    expect(unitPriceCents(5, 16, 'g')?.cents).toBe(313);
    // 0 cents is 0, not a rounding artefact.
    expect(unitPriceCents(0, 100, 'g')?.cents).toBe(0);
  });

  it('returns null without a usable net amount', () => {
    expect(unitPriceCents(500, null, 'g')).toBeNull();
    expect(unitPriceCents(500, 100, null)).toBeNull();
    expect(unitPriceCents(500, undefined, undefined)).toBeNull();
    expect(unitPriceCents(500, 0, 'g')).toBeNull();
    expect(unitPriceCents(500, -5, 'g')).toBeNull();
    expect(unitPriceCents(500, 12.5, 'g')).toBeNull();
  });
});
