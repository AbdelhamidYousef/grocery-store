import { describe, expect, it } from 'vitest';

import { parseRewardForm } from './LoyaltyAdmin';

const base = {
  name: 'EUR 5 voucher',
  description: '',
  cost: '500',
  kind: 'coupon_fixed' as const,
  value: '5',
  active: true,
};

describe('parseRewardForm', () => {
  it('turns typed euros into integer cents without floats', () => {
    expect(parseRewardForm({ ...base, value: '6.99' })).toMatchObject({
      ok: true,
      input: { valueCents: 699, costPoints: 500 },
    });
  });
  it('ignores the value for free shipping', () => {
    expect(parseRewardForm({ ...base, kind: 'free_shipping', value: '' })).toMatchObject({
      ok: true,
      input: { valueCents: 0 },
    });
  });
  it('reports every bad field', () => {
    const r = parseRewardForm({ ...base, name: ' ', cost: '0', value: 'abc' });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? [] : Object.keys(r.errors).sort()).toEqual(['cost', 'name', 'value']);
  });
});
