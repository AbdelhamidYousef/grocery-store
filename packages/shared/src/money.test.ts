import { describe, expect, it } from 'vitest';

import { applyPercent, formatMoney, sumCents } from './money';

describe('formatMoney', () => {
  it('formats cents as a currency string', () => {
    expect(formatMoney(1999)).toBe('$19.99');
  });

  it('formats zero and large amounts with grouping', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(123_456_789)).toBe('$1,234,567.89');
  });

  it('supports other currencies and locales', () => {
    expect(formatMoney(1050, 'EUR', 'de-DE')).toBe('10,50 €');
  });

  it('rejects fractional cents', () => {
    expect(() => formatMoney(10.5)).toThrow(RangeError);
  });
});

describe('sumCents', () => {
  it('adds integers exactly', () => {
    expect(sumCents([10, 20, 30])).toBe(60);
  });

  it('returns zero for an empty list', () => {
    expect(sumCents([])).toBe(0);
  });

  it('rejects floats', () => {
    expect(() => sumCents([10, 0.5])).toThrow(RangeError);
  });
});

describe('applyPercent', () => {
  it('takes a whole percentage', () => {
    expect(applyPercent(2000, 10)).toBe(200);
  });

  it('rounds half up', () => {
    expect(applyPercent(5, 50)).toBe(3);
    expect(applyPercent(1, 49)).toBe(0);
  });

  it('handles two-decimal percentages without float drift', () => {
    expect(applyPercent(10_000, 7.25)).toBe(725);
  });

  it('rejects negative amounts and out-of-range percentages', () => {
    expect(() => applyPercent(-1, 10)).toThrow(RangeError);
    expect(() => applyPercent(100, -5)).toThrow(RangeError);
    expect(() => applyPercent(100, 101)).toThrow(RangeError);
  });
});
