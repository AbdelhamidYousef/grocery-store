import { describe, expect, it } from 'vitest';

import {
  SHORT_DATE_DAYS,
  batchClass,
  compareBestBefore,
  daysUntil,
  freshBestBefore,
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
