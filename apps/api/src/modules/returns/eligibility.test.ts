import { describe, expect, it } from 'vitest';

import { assessEligibility } from './eligibility.ts';

const NOW = new Date('2026-11-14T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const line = (id: string, quantity: number, total = 1000, discount = 0) => ({
  id,
  quantity,
  lineTotalCents: total,
  discountCents: discount,
});
const base = {
  status: 'delivered' as const,
  deliveredAt: day(2),
  windowDays: 30,
  now: NOW,
  lines: [line('a', 3)],
  counted: new Map<string, number>(),
};

describe('assessEligibility', () => {
  it('is eligible with the deadline a window after delivery', () => {
    const r = assessEligibility(base);
    expect(r.eligible).toBe(true);
    expect(r.deadline?.toISOString()).toBe(
      new Date(day(2).getTime() + 30 * 86_400_000).toISOString(),
    );
    expect(r.returnable.get('a')).toBe(3);
  });

  it('keeps the last day open and closes the day after', () => {
    expect(assessEligibility({ ...base, deliveredAt: day(30) }).eligible).toBe(true);
    expect(
      assessEligibility({ ...base, deliveredAt: new Date(day(30).getTime() - 1) }).eligible,
    ).toBe(false);
  });

  it('needs a delivered order', () => {
    for (const status of ['paid', 'processing', 'shipped', 'refunded', 'cancelled'] as const) {
      expect(assessEligibility({ ...base, status }).eligible).toBe(false);
    }
  });

  it('subtracts counted units, and offers nothing for a free line', () => {
    const r = assessEligibility({
      ...base,
      lines: [line('a', 3), line('gift', 1, 500, 500)],
      counted: new Map([['a', 1]]),
    });
    expect(r.returnable.get('a')).toBe(2);
    expect(r.returnable.get('gift')).toBe(0);
    expect(r.eligible).toBe(true);
  });

  it('is not eligible once every unit is in a return', () => {
    const r = assessEligibility({ ...base, counted: new Map([['a', 3]]) });
    expect(r).toMatchObject({
      eligible: false,
      reason: 'Every item in this order is already in a return',
    });
  });
});
