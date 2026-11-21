import { describe, expect, it } from 'vitest';

import { quote, type ShippingRule } from './shipping.ts';

// A method is a delivery kind (G9): the prices come from the basket rules, the rows only name it.
const slot: ShippingRule = { code: 'slot', name: 'Delivery slot', etaDaysMin: 0, etaDaysMax: 0 };
const express: ShippingRule = { code: 'express', name: 'Express', etaDaysMin: 0, etaDaysMax: 0 };
const ctx = (goodsCents: number, outerArea = false) => ({
  country: 'DE',
  goodsCents,
  outerArea,
});

describe('quote', () => {
  it('prices a slot at 2.99 and express at 4.99, cheapest first', () => {
    const result = quote([express, slot], ctx(2000));
    expect(result.map((q) => [q.code, q.priceCents, q.free])).toEqual([
      ['slot', 299, false],
      ['express', 499, false],
    ]);
    expect(result[0]).toMatchObject({ currency: 'EUR' });
  });

  it('frees a slot from exactly 49.00 of goods, never express', () => {
    expect(quote([slot, express], ctx(4899)).map((q) => q.priceCents)).toEqual([299, 499]);
    const at = quote([slot, express], ctx(4900));
    expect(at.map((q) => [q.code, q.priceCents, q.free])).toEqual([
      ['slot', 0, true],
      ['express', 499, false],
    ]);
    expect(quote([express], ctx(1_000_000))[0]?.priceCents).toBe(499);
  });

  it('adds the outer-area surcharge to both', () => {
    expect(quote([slot, express], ctx(2000, true)).map((q) => q.priceCents)).toEqual([349, 549]);
  });

  it('passes the threshold along so the cart can show a free-delivery hint', () => {
    const quotes = quote([slot, express], ctx(0));
    expect(quotes.map((q) => [q.code, q.freeOverCents])).toEqual([
      ['slot', 4900],
      ['express', null],
    ]);
  });

  it('orders equal prices by code so the list is stable', () => {
    const a: ShippingRule = { ...express, code: 'b-method' };
    const b: ShippingRule = { ...express, code: 'a-method' };
    const result = quote([a, b], ctx(0));
    expect(result.map((q) => q.code)).toEqual(['a-method', 'b-method']);
  });
});
