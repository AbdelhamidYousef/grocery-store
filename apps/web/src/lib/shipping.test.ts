import { describe, expect, it } from 'vitest';

import { FREE_SHIPPING_OVER_CENTS, freeShippingProgress } from './shipping';

describe('freeShippingProgress', () => {
  it('counts down to the threshold in integer cents', () => {
    expect(freeShippingProgress(1999)).toEqual({ remainingCents: 2901, percent: 40 });
  });

  it('is complete at and above the threshold', () => {
    expect(freeShippingProgress(FREE_SHIPPING_OVER_CENTS)).toEqual({
      remainingCents: 0,
      percent: 100,
    });
    expect(freeShippingProgress(FREE_SHIPPING_OVER_CENTS * 3).percent).toBe(100);
  });

  it('starts at zero for an empty cart', () => {
    expect(freeShippingProgress(0)).toEqual({
      remainingCents: FREE_SHIPPING_OVER_CENTS,
      percent: 0,
    });
  });
});
