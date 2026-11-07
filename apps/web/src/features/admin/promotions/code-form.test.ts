import { describe, expect, it } from 'vitest';

import {
  describeCode,
  emptyCodeForm,
  parseCodeForm,
  parseGiftForm,
  parseTierForm,
  previewForm,
  type CodeFormState,
} from './code-form';

const form = (over: Partial<CodeFormState> = {}): CodeFormState => ({
  ...emptyCodeForm,
  code: 'SPRING10',
  value: '10',
  ...over,
});

describe('euros to cents in the code form', () => {
  // "1,50" decision: a comma is a decimal separator (as in the product price field); a thousands
  // separator is not supported, so "1,000.50" is refused rather than guessed at.
  it.each([
    ['5', 500],
    ['5.5', 550],
    ['5.50', 550],
    ['0.1', 10],
    ['0.10', 10],
    ['1,50', 150],
    ['19.99', 1999],
    ['0', 0],
  ])('reads %s as %i cents', (text, cents) => {
    const parsed = parseCodeForm(
      form({ kind: 'fixed', value: text === '0' ? '5' : text, minSpend: text }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input.minSpendCents).toBe(cents);
  });

  it.each(['', 'abc', '-5', '5.555', '1,000.50', '5.', '€5'])('refuses %j as an amount', (text) => {
    const parsed = parseCodeForm(form({ kind: 'fixed', value: text }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.value).toMatch(/euros/);
  });

  it('turns 19.99 into 1999 where float maths would give 1998.99...', () => {
    const parsed = parseCodeForm(form({ kind: 'fixed', value: '19.99' }));
    expect(parsed.ok && parsed.input.value).toBe(1999);
  });
});

describe('code form validation', () => {
  it('accepts a valid percent code and sends nulls for empty limits', () => {
    const parsed = parseCodeForm(form());
    expect(parsed).toMatchObject({
      ok: true,
      input: {
        code: 'SPRING10',
        kind: 'percent',
        value: 10,
        maxUses: null,
        perCustomerMax: null,
        startsAt: null,
      },
    });
  });

  it.each([
    ['percent 101', { value: '101' }, 'value'],
    ['percent 0', { value: '0' }, 'value'],
    ['percent 10.5', { value: '10.5' }, 'value'],
    ['fixed 0', { kind: 'fixed' as const, value: '0' }, 'value'],
    ['short code', { code: 'ab' }, 'code'],
    ['code with a space', { code: 'SPRING 10' }, 'code'],
    ['zero cap', { maxUses: '0' }, 'maxUses'],
    ['text cap', { perCustomerMax: 'two' }, 'perCustomerMax'],
    ['bad minimum', { minSpend: 'lots' }, 'minSpend'],
    [
      'ends before it starts',
      { startsAt: '2026-12-02T10:00', endsAt: '2026-12-01T10:00' },
      'endsAt',
    ],
  ])('refuses %s with a message on the %s field', (_n, over, field) => {
    const parsed = parseCodeForm(form(over));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[field]).toBeTruthy();
  });

  it('free shipping needs no value', () => {
    const parsed = parseCodeForm(form({ kind: 'free_shipping', value: '' }));
    expect(parsed).toMatchObject({ ok: true, input: { value: 0 } });
  });

  it('converts the datetime-local value to UTC ISO', () => {
    const parsed = parseCodeForm(
      form({ startsAt: '2026-12-01T10:30', endsAt: '2026-12-02T10:30' }),
    );
    expect(parsed.ok && parsed.input.startsAt).toBe('2026-12-01T10:30:00.000Z');
  });
});

describe('preview sentence', () => {
  const base = {
    kind: 'percent' as const,
    value: 10,
    minSpendCents: 0,
    firstOrderOnly: false,
    excludeSaleItems: false,
    maxUses: null,
    perCustomerMax: null,
  };
  it('says what a percent code with a minimum and a cap does', () => {
    expect(describeCode({ ...base, minSpendCents: 3000, maxUses: 100 }, 5)).toBe(
      '10% off, min €30.00, 5 of 100 used',
    );
  });
  it('says what a fixed first-order code does', () => {
    expect(describeCode({ ...base, kind: 'fixed', value: 500, firstOrderOnly: true })).toBe(
      '€5.00 off, first order only',
    );
  });
  it('says what free shipping does', () => {
    expect(describeCode({ ...base, kind: 'free_shipping', value: 0, minSpendCents: 2500 })).toBe(
      'Free shipping, min €25.00',
    );
  });
  it('shows a placeholder while the amount is not valid', () => {
    expect(previewForm(form({ value: '' }), 0)).toMatch(/Fill in the amount/);
    expect(previewForm(form({ value: '15', minSpend: '30' }), 2)).toBe(
      '15% off, min €30.00, 2 used',
    );
  });
});

describe('tier and gift forms', () => {
  it('parses euros and percent', () => {
    expect(parseTierForm({ min: '75', percent: '5', active: true })).toEqual({
      ok: true,
      input: { minCents: 7500, percent: 5, active: true },
    });
  });
  it.each([
    [{ min: '0', percent: '5' }, 'min'],
    [{ min: '75', percent: '101' }, 'percent'],
    [{ min: 'x', percent: '5' }, 'min'],
    [{ min: '75', percent: '' }, 'percent'],
  ])('refuses %j', (over, field) => {
    const parsed = parseTierForm({ active: true, ...over });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[field]).toBeTruthy();
  });
  it('needs a threshold above 0 and a SKU for the gift', () => {
    expect(parseGiftForm({ threshold: '40', variant: ' SKU-1 ' })).toMatchObject({
      ok: true,
      input: { thresholdCents: 4000 },
    });
    expect(parseGiftForm({ threshold: '0', variant: 'SKU-1' })).toMatchObject({ ok: false });
    expect(parseGiftForm({ threshold: '40', variant: ' ' })).toMatchObject({ ok: false });
  });
});
