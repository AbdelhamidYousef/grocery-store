import { describe, expect, it } from 'vitest';

import {
  bundleAvailable,
  bundleSavingCents,
  individualTotalCents,
  isValidBundlePrice,
} from './bundles.ts';

const parts = [
  { priceCents: 1299, qty: 2 },
  { priceCents: 450, qty: 1 },
];

describe('bundle money', () => {
  it('adds the components by quantity', () => {
    expect(individualTotalCents(parts)).toBe(3048);
  });
  it('reports the saving in cents', () => {
    expect(bundleSavingCents(2499, parts)).toEqual({ individualCents: 3048, savingCents: 549 });
  });
  it('never reports a negative saving', () => {
    expect(bundleSavingCents(5000, parts).savingCents).toBe(0);
  });
  it('accepts only a price below the parts', () => {
    expect(isValidBundlePrice(3047, parts)).toBe(true);
    expect(isValidBundlePrice(3048, parts)).toBe(false);
    expect(isValidBundlePrice(1, [])).toBe(false);
  });
});

describe('bundleAvailable', () => {
  it('is the scarcest component divided by its quantity, rounded down', () => {
    expect(
      bundleAvailable([
        { available: 9, qty: 2 },
        { available: 10, qty: 1 },
      ]),
    ).toBe(4);
  });
  it('is zero when any component is out, negative stock counts as zero', () => {
    expect(
      bundleAvailable([
        { available: 0, qty: 1 },
        { available: 5, qty: 1 },
      ]),
    ).toBe(0);
    expect(bundleAvailable([{ available: -3, qty: 1 }])).toBe(0);
  });
  it('is zero for an empty kit', () => {
    expect(bundleAvailable([])).toBe(0);
  });
});
