import { describe, expect, it } from 'vitest';

import {
  WEIGHT_BUFFER_PERCENT,
  authorisationCents,
  estimateCents,
  formatGrams,
  pricePerKgFor,
  weightBufferCents,
  weighedCents,
} from './weight.ts';

describe('weighedCents', () => {
  it('is round(pricePerKg x grams / 1000), half up, once', () => {
    expect(weighedCents(378, 500)).toBe(189);
    expect(weighedCents(378, 640)).toBe(242); // 241.92
    expect(weighedCents(5198, 487)).toBe(2531); // 2531.426
    expect(weighedCents(1000, 1)).toBe(1); // 1.0
    expect(weighedCents(1, 500)).toBe(1); // 0.5 rounds up
    expect(weighedCents(1, 499)).toBe(0); // 0.499
    expect(weighedCents(378, 0)).toBe(0);
  });
  it('is rounded per line, not per gram', () => {
    // 3 packs weighed together (1,430 g) differ by a cent from weighing each (3 x 477 g).
    expect(weighedCents(699, 1430)).toBe(1000); // 999.57
    expect(3 * weighedCents(699, 477)).toBe(3 * 333); // 333.42 each
  });
  it('is exact for every whole-gram weight up to 5 kg at a few prices', () => {
    for (const perKg of [189, 378, 2398, 24990]) {
      for (let g = 0; g <= 5000; g++) {
        expect(Math.abs(weighedCents(perKg, g) - (perKg * g) / 1000)).toBeLessThanOrEqual(0.5);
      }
    }
  });
});

describe('estimate and price per kg', () => {
  it('estimates a nominal unit and goes back to the price per kg', () => {
    expect(estimateCents(378, 500)).toBe(189);
    expect(pricePerKgFor(189, 500)).toBe(378);
    expect(pricePerKgFor(2499, 100)).toBe(24990);
    expect(estimateCents(pricePerKgFor(1499, 250), 250)).toBe(1499);
  });
});

describe('authorisation', () => {
  it('adds 15 % to the weighed lines only', () => {
    expect(WEIGHT_BUFFER_PERCENT).toBe(15);
    expect(weightBufferCents(189)).toBe(28); // 28.35
    expect(authorisationCents(189, [189])).toBe(217); // "we hold up to 2.17 EUR"
    expect(authorisationCents(1000, [])).toBe(1000);
    expect(authorisationCents(1299 + 499, [1299])).toBe(1299 + 499 + 195);
  });
  it('rounds the buffer once over all weighed lines, half up', () => {
    expect(weightBufferCents(10)).toBe(2); // 1.5 rounds up
    expect(authorisationCents(30, [10, 10, 10])).toBe(30 + 5); // 4.5 rounds up, not 3 x 2
  });
  it('never authorises less than the total', () => {
    for (let c = 0; c < 2000; c += 7) expect(authorisationCents(c, [c])).toBeGreaterThanOrEqual(c);
  });
});

describe('formatGrams', () => {
  it('prints grams under a kilo and kilos above', () => {
    expect(formatGrams(500, 'en-IE')).toBe('500 g');
    expect(formatGrams(1000, 'en-IE')).toBe('1 kg');
    expect(formatGrams(1250, 'de-DE')).toBe('1,3 kg');
    expect(formatGrams(100, 'de-DE')).toBe('100 g');
  });
});
