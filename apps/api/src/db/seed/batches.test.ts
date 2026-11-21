import { batchClass } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { seedBatches } from './batches.ts';

const today = '2026-11-21';

describe('seedBatches', () => {
  it('always adds up to the stock row', () => {
    for (let key = 0; key < 200; key++) {
      for (const quantity of [0, 1, 2, 3, 4, 9, 57, 120]) {
        for (const shelfLifeDays of [null, 2, 5, 90]) {
          const sum = seedBatches({ quantity, shelfLifeDays, key, today }).reduce(
            (n, b) => n + b.quantity,
            0,
          );
          expect(sum).toBe(quantity);
        }
      }
    }
  });
  it('keeps non-food in one undated batch', () => {
    expect(seedBatches({ quantity: 40, shelfLifeDays: null, key: 8, today })).toEqual([
      { bestBefore: null, quantity: 40 },
    ]);
  });
  it('gives the demo short-dated and expired stock, but mostly regular', () => {
    const counts = { short: 0, expired: 0, regular: 0 };
    for (let key = 0; key < 230; key++) {
      for (const b of seedBatches({ quantity: 30, shelfLifeDays: 7, key, today })) {
        counts[batchClass(b.bestBefore, today)] += 1;
      }
    }
    expect(counts.short).toBeGreaterThan(20);
    expect(counts.expired).toBeGreaterThanOrEqual(5);
    expect(counts.regular).toBeGreaterThan(counts.short * 3);
  });
  it('is deterministic', () => {
    const a = seedBatches({ quantity: 12, shelfLifeDays: 6, key: 14, today });
    expect(seedBatches({ quantity: 12, shelfLifeDays: 6, key: 14, today })).toEqual(a);
  });
});
