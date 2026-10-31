import { describe, expect, it } from 'vitest';

import { freeShippingProgress } from './shipping';

const THRESHOLD = 4900;

describe('freeShippingProgress', () => {
  it('counts down to the threshold in integer cents', () => {
    expect(freeShippingProgress(1999, THRESHOLD)).toEqual({ remainingCents: 2901, percent: 40 });
  });

  it('is complete at and above the threshold', () => {
    expect(freeShippingProgress(THRESHOLD, THRESHOLD)).toEqual({
      remainingCents: 0,
      percent: 100,
    });
    expect(freeShippingProgress(THRESHOLD * 3, THRESHOLD).percent).toBe(100);
  });

  it('starts at zero for an empty cart', () => {
    expect(freeShippingProgress(0, THRESHOLD)).toEqual({ remainingCents: THRESHOLD, percent: 0 });
  });

  it('treats a zero threshold as already free', () => {
    expect(freeShippingProgress(0, 0)).toEqual({ remainingCents: 0, percent: 100 });
  });
});
