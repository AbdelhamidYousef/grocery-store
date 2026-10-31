import { describe, expect, it } from 'vitest';

import { centsToInput, inputToCents, inputToInt } from './money-input';

describe('money input', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['0.05', 5],
    ['19.99', 1999],
    [' 7 ', 700],
  ])('reads %s as %i cents without floating point', (text, cents) => {
    expect(inputToCents(text)).toBe(cents);
  });

  it.each(['', 'abc', '-1', '1.234', '1..2', '12.', '.5', '1e3', '99999999'])(
    'refuses %j',
    (text) => {
      expect(inputToCents(text)).toBeNull();
    },
  );

  it('writes cents back as a two-decimal string', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(100_000)).toBe('1000.00');
  });

  it('round-trips every price in a range', () => {
    for (let c = 0; c < 5000; c += 7) expect(inputToCents(centsToInput(c))).toBe(c);
  });

  it('reads whole numbers only', () => {
    expect(inputToInt('12')).toBe(12);
    expect(inputToInt('1.5')).toBeNull();
    expect(inputToInt('-2')).toBeNull();
    expect(inputToInt('')).toBeNull();
  });
});
