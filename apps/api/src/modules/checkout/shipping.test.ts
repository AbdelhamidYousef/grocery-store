import { describe, expect, it } from 'vitest';

import { quote, shippingPriceCents, type ShippingRule } from './shipping.ts';

const standard: ShippingRule = {
  code: 'standard',
  name: 'Standard',
  baseCents: 490,
  perKgCents: 100,
  freeOverCents: 4900,
  etaDaysMin: 3,
  etaDaysMax: 5,
};
const express: ShippingRule = {
  code: 'express',
  name: 'Express',
  baseCents: 990,
  perKgCents: 200,
  freeOverCents: null,
  etaDaysMin: 1,
  etaDaysMax: 2,
};

describe('shippingPriceCents', () => {
  it('charges the base price for an empty or weightless cart', () => {
    expect(shippingPriceCents(standard, { weightGrams: 0, subtotalCents: 0 })).toBe(490);
  });

  it('bills every started kilogram', () => {
    const price = (weightGrams: number) =>
      shippingPriceCents(standard, { weightGrams, subtotalCents: 1000 });
    expect(price(1)).toBe(590);
    expect(price(1000)).toBe(590);
    expect(price(1001)).toBe(690);
    expect(price(2500)).toBe(790);
  });

  it('is free at exactly the threshold and above, not one cent below', () => {
    expect(shippingPriceCents(standard, { weightGrams: 3000, subtotalCents: 4899 })).toBe(790);
    expect(shippingPriceCents(standard, { weightGrams: 3000, subtotalCents: 4900 })).toBe(0);
    expect(shippingPriceCents(standard, { weightGrams: 3000, subtotalCents: 9000 })).toBe(0);
  });

  it('never gives free shipping when the method has no threshold', () => {
    expect(shippingPriceCents(express, { weightGrams: 500, subtotalCents: 1_000_000 })).toBe(1190);
  });
});

describe('quote', () => {
  it('prices every method, cheapest first, and flags the free one', () => {
    const result = quote([express, standard], {
      country: 'DE',
      weightGrams: 1200,
      subtotalCents: 5000,
    });
    expect(result.map((q) => [q.code, q.priceCents, q.free])).toEqual([
      ['standard', 0, true],
      ['express', 1390, false],
    ]);
    expect(result[0]).toMatchObject({ currency: 'EUR', etaDaysMin: 3, etaDaysMax: 5 });
  });

  it('passes each method threshold along so the cart can show a free-shipping hint', () => {
    const quotes = quote([standard, express], { country: 'DE', weightGrams: 0, subtotalCents: 0 });
    expect(quotes.map((q) => [q.code, q.freeOverCents])).toEqual([
      ['standard', 4900],
      ['express', null],
    ]);
  });

  it('orders equal prices by code so the list is stable', () => {
    const a: ShippingRule = { ...express, code: 'b-method' };
    const b: ShippingRule = { ...express, code: 'a-method' };
    const result = quote([a, b], { country: 'DE', weightGrams: 0, subtotalCents: 0 });
    expect(result.map((q) => q.code)).toEqual(['a-method', 'b-method']);
  });
});
