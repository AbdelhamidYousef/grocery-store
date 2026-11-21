import { describe, expect, it } from 'vitest';

import {
  SHORT_DATED_PERCENT_OFF,
  SHORT_DATE_DAYS,
  batchClass,
  compareBestBefore,
  daysUntil,
  freshBestBefore,
  shortDatedPrice,
} from './expiry.ts';

describe('best-before classes', () => {
  const today = '2026-11-21';
  it('counts whole days, across month ends and the clock change', () => {
    expect(daysUntil('2026-11-21', today)).toBe(0);
    expect(daysUntil('2026-11-23', today)).toBe(2);
    expect(daysUntil('2026-11-20', today)).toBe(-1);
    expect(daysUntil('2027-03-29', '2027-03-27')).toBe(2);
    expect(daysUntil('2026-12-01', today)).toBe(10);
  });
  it('is expired the day after its date, short-dated for two days before, else regular', () => {
    expect(SHORT_DATE_DAYS).toBe(2);
    expect(batchClass('2026-11-20', today)).toBe('expired');
    expect(batchClass('2026-11-21', today)).toBe('short');
    expect(batchClass('2026-11-23', today)).toBe('short');
    expect(batchClass('2026-11-24', today)).toBe('regular');
    expect(batchClass(null, today)).toBe('regular');
  });
  it('dates a fresh delivery from the shelf life', () => {
    expect(freshBestBefore(today, 5)).toBe('2026-11-26');
    expect(freshBestBefore(today, null)).toBeNull();
  });
  it('sorts oldest first and no date last', () => {
    const dates = [null, '2026-12-01', '2026-11-22', null];
    expect([...dates].sort(compareBestBefore)).toEqual(['2026-11-22', '2026-12-01', null, null]);
  });
});

describe('shortDatedPrice', () => {
  it('takes 30 % off in whole cents, rounding the reduction half up', () => {
    expect(SHORT_DATED_PERCENT_OFF).toBe(30);
    expect(shortDatedPrice(100)).toBe(70);
    expect(shortDatedPrice(199)).toBe(139); // 59.7 off rounds to 60
    expect(shortDatedPrice(105)).toBe(73); // 31.5 off rounds up to 32
    expect(shortDatedPrice(1)).toBe(1); // 0.3 off rounds to 0
    expect(shortDatedPrice(2)).toBe(1); // 0.6 off rounds to 1
    expect(shortDatedPrice(0)).toBe(0);
  });
  it('never goes below zero, never above the normal price, and price + reduction is the normal price', () => {
    for (let cents = 0; cents <= 5000; cents++) {
      const price = shortDatedPrice(cents);
      expect(price).toBeLessThanOrEqual(cents);
      expect(price).toBeGreaterThanOrEqual(0);
      expect(Math.abs(cents - price - cents * 0.3)).toBeLessThanOrEqual(0.5);
    }
  });
});
