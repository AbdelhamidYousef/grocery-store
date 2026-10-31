import { describe, expect, it } from 'vitest';

import { priceCart } from './priceCart.ts';
import type { PriceCartInput, PricingCode, PricingLine } from './types.ts';

const NOW = new Date('2026-10-31T12:00:00Z');

function line(id: string, baseCents: number, extra: Partial<PricingLine> = {}): PricingLine {
  return { variantId: id, productId: `p-${id}`, qty: 1, baseCents, ...extra };
}

function cart(over: Partial<PriceCartInput> = {}): PriceCartInput {
  return {
    now: NOW,
    currency: 'EUR',
    lines: [],
    shipping: { methodCents: 500 },
    ...over,
  };
}

const pct = (value: number, extra: Partial<PricingCode> = {}): PricingCode => ({
  id: 'c1',
  code: 'PAWS10',
  kind: 'percent',
  value,
  ...extra,
});
const fixed = (value: number, extra: Partial<PricingCode> = {}): PricingCode => ({
  id: 'c2',
  code: 'WELCOME5',
  kind: 'fixed',
  value,
  ...extra,
});
const freeShip: PricingCode = { id: 'c3', code: 'FREESHIP', kind: 'free_shipping' };

const tiers = [
  { id: 't1', minCents: 7500, percent: 5 },
  { id: 't2', minCents: 10000, percent: 10 },
];

describe('priceCart: empty and trivial carts', () => {
  it('prices an empty cart at zero, with no shipping and no notices', () => {
    const r = priceCart(
      cart({ code: pct(10), tiers, shipping: { methodCents: 500, freeOverCents: 4000 } }),
    );
    expect(r.totalCents).toBe(0);
    expect(r.shippingCents).toBe(0);
    expect(r.lines).toEqual([]);
    expect(r.notices).toEqual([]);
    expect(r.progress.freeShipping).toMatchObject({
      remainingCents: 4000,
      percent: 0,
      reached: false,
    });
  });

  it('echoes the injected clock and currency', () => {
    const r = priceCart(cart({ lines: [line('a', 1000)] }));
    expect(r.pricedAt).toBe('2026-10-31T12:00:00.000Z');
    expect(r.currency).toBe('EUR');
    expect(r.totalCents).toBe(1500);
  });

  it('rejects non-integer cents', () => {
    expect(() => priceCart(cart({ lines: [line('a', 10.5)] }))).toThrow();
  });
});

describe('priceCart step 1: best single price per line', () => {
  const cases: {
    name: string;
    extra: Partial<PricingLine>;
    member: boolean;
    unit: number;
    source: string;
  }[] = [
    { name: 'base only', extra: {}, member: false, unit: 1000, source: 'base' },
    {
      name: 'sale price while onSale',
      extra: { saleCents: 800, onSale: true },
      member: false,
      unit: 800,
      source: 'sale',
    },
    {
      name: 'sale ignored when not onSale',
      extra: { saleCents: 800 },
      member: false,
      unit: 1000,
      source: 'base',
    },
    {
      name: 'member price for members',
      extra: { memberCents: 900 },
      member: true,
      unit: 900,
      source: 'member',
    },
    {
      name: 'member price hidden from non-members',
      extra: { memberCents: 900 },
      member: false,
      unit: 1000,
      source: 'base',
    },
    {
      name: 'sale beats member',
      extra: { saleCents: 700, onSale: true, memberCents: 900 },
      member: true,
      unit: 700,
      source: 'sale',
    },
    {
      name: 'member beats sale',
      extra: { saleCents: 950, onSale: true, memberCents: 900 },
      member: true,
      unit: 900,
      source: 'member',
    },
    {
      name: 'tie: sale wins',
      extra: { saleCents: 900, onSale: true, memberCents: 900 },
      member: true,
      unit: 900,
      source: 'sale',
    },
    {
      name: 'a "sale" at or above base is not a sale',
      extra: { saleCents: 1000, onSale: true },
      member: false,
      unit: 1000,
      source: 'base',
    },
    {
      name: 'fixed price ignores sale and member',
      extra: { fixedPrice: true, saleCents: 100, onSale: true, memberCents: 100 },
      member: true,
      unit: 1000,
      source: 'fixed',
    },
  ];
  it.each(cases)('$name', ({ extra, member, unit, source }) => {
    const r = priceCart(
      cart({ lines: [line('a', 1000, { qty: 2, ...extra })], customer: { isMember: member } }),
    );
    expect(r.lines[0]).toMatchObject({
      unitCents: unit,
      priceSource: source,
      lineSubtotalCents: unit * 2,
    });
  });
});

describe('priceCart step 2: tier vs code, whichever saves more', () => {
  it('applies a tier when no code is given', () => {
    const r = priceCart(cart({ lines: [line('a', 8000)], tiers }));
    expect(r.adjustments).toMatchObject([{ type: 'bulk_tier', refId: 't1', cents: 400 }]);
    expect(r.merchandiseCents).toBe(7600);
  });

  it('picks the higher tier when several are met', () => {
    const r = priceCart(cart({ lines: [line('a', 12000)], tiers }));
    expect(r.adjustments[0]).toMatchObject({ refId: 't2', cents: 1200 });
  });

  it('tier below its minimum gives nothing and shows next-tier progress', () => {
    const r = priceCart(cart({ lines: [line('a', 7499)], tiers }));
    expect(r.adjustments).toEqual([]);
    expect(r.progress.nextTier).toMatchObject({
      thresholdCents: 7500,
      remainingCents: 1,
      percent: 99,
      discountPercent: 5,
    });
  });

  it('tier boundary: exactly the minimum qualifies', () => {
    const r = priceCart(cart({ lines: [line('a', 7500)], tiers }));
    expect(r.adjustments[0]).toMatchObject({ type: 'bulk_tier', cents: 375 });
    expect(r.progress.nextTier).toMatchObject({ thresholdCents: 10000, remainingCents: 2500 });
  });

  it('no next tier once the top is reached', () => {
    expect(priceCart(cart({ lines: [line('a', 10000)], tiers })).progress.nextTier).toBeNull();
  });

  it('code beats tier: only the code applies and no notice', () => {
    const r = priceCart(cart({ lines: [line('a', 8000)], tiers, code: pct(20) }));
    expect(r.adjustments).toMatchObject([{ type: 'code', cents: 1600 }]);
    expect(r.notices).toEqual([]);
  });

  it('tier beats code: code is dropped with a notice', () => {
    const r = priceCart(cart({ lines: [line('a', 12000)], tiers, code: pct(5) }));
    expect(r.adjustments).toMatchObject([{ type: 'bulk_tier', cents: 1200 }]);
    expect(r.notices).toEqual([{ key: 'code_not_stackable', refId: 'c1' }]);
  });

  it('tie goes to the tier', () => {
    const r = priceCart(cart({ lines: [line('a', 10000)], tiers, code: pct(10) }));
    expect(r.adjustments[0]).toMatchObject({ type: 'bulk_tier', cents: 1000 });
    expect(r.notices).toEqual([{ key: 'code_not_stackable', refId: 'c1' }]);
  });

  it('never both: a fixed code over a tier still replaces it', () => {
    const r = priceCart(cart({ lines: [line('a', 8000)], tiers, code: fixed(2000) }));
    expect(r.adjustments).toHaveLength(1);
    expect(r.adjustments[0]).toMatchObject({ type: 'code', cents: 2000 });
  });

  it('percent code rounds half-up on cents', () => {
    // 10% of 1005 = 100.5 -> 101
    const r = priceCart(cart({ lines: [line('a', 1005)], code: pct(10) }));
    expect(r.adjustments[0]!.cents).toBe(101);
  });

  it('rounding on 3 lines x 33 cents: the odd cent lands on the first line, total still exact', () => {
    const r = priceCart(
      cart({ lines: [line('a', 33), line('b', 33), line('c', 33)], code: pct(10) }),
    );
    // 10% of 99 = 9.9 -> 10 cents
    expect(r.discountCents).toBe(10);
    expect(r.lines.map((l) => l.lineDiscountCents)).toEqual([4, 3, 3]);
    expect(r.merchandiseCents).toBe(89);
  });

  it('fixed code larger than the cart is capped at the cart, never below zero', () => {
    const r = priceCart(cart({ lines: [line('a', 300), line('b', 200)], code: fixed(5000) }));
    expect(r.discountCents).toBe(500);
    expect(r.merchandiseCents).toBe(0);
    expect(r.lines.every((l) => l.lineTotalCents === 0)).toBe(true);
    expect(r.totalCents).toBe(500); // shipping is still due
  });

  it('100% code zeroes merchandise', () => {
    const r = priceCart(cart({ lines: [line('a', 999)], code: pct(100) }));
    expect(r.merchandiseCents).toBe(0);
  });

  it('quantities are respected in allocation', () => {
    const r = priceCart(
      cart({ lines: [line('a', 100, { qty: 3 }), line('b', 100)], code: fixed(100) }),
    );
    expect(r.lines.map((l) => l.lineDiscountCents)).toEqual([75, 25]);
  });

  it('excludeSaleItems: the sale line is skipped, the full-price line gets it all', () => {
    const r = priceCart(
      cart({
        lines: [line('a', 2000, { saleCents: 1000, onSale: true }), line('b', 2000)],
        code: pct(10, { excludeSaleItems: true }),
      }),
    );
    expect(r.adjustments[0]!.cents).toBe(200);
    expect(r.lines[0]!.lineDiscountCents).toBe(0);
    expect(r.lines[1]!.lineDiscountCents).toBe(200);
  });

  it('excludeSaleItems with only sale items: no eligible items notice', () => {
    const r = priceCart(
      cart({
        lines: [line('a', 2000, { saleCents: 1000, onSale: true })],
        code: pct(10, { excludeSaleItems: true }),
      }),
    );
    expect(r.adjustments).toEqual([]);
    expect(r.notices).toEqual([{ key: 'code_no_eligible_items', refId: 'c1' }]);
  });

  it('codes without the exclusion do apply to sale lines', () => {
    const r = priceCart(
      cart({ lines: [line('a', 2000, { saleCents: 1000, onSale: true })], code: pct(10) }),
    );
    expect(r.adjustments[0]!.cents).toBe(100);
  });

  it('fixed-price lines are excluded from tiers and codes', () => {
    const r = priceCart(
      cart({
        lines: [line('trial', 9000, { fixedPrice: true }), line('b', 1000)],
        tiers,
        code: pct(10),
      }),
    );
    expect(r.adjustments[0]).toMatchObject({ type: 'code', cents: 100 });
    expect(r.lines[0]!.lineDiscountCents).toBe(0);
    expect(r.lines[1]!.lineDiscountCents).toBe(100);
  });

  it('fixed-price lines do not unlock tiers', () => {
    const r = priceCart(cart({ lines: [line('bundle', 9000, { fixedPrice: true })], tiers }));
    expect(r.adjustments).toEqual([]);
  });

  it('min spend is measured on eligible lines and reports what is missing', () => {
    const r = priceCart(
      cart({
        lines: [line('a', 1500, { saleCents: 1000, onSale: true }), line('b', 1000)],
        code: pct(10, { minSpendCents: 1500, excludeSaleItems: true }),
      }),
    );
    expect(r.adjustments).toEqual([]);
    expect(r.notices).toEqual([{ key: 'code_min_spend', refId: 'c1', cents: 500 }]);
  });

  it('min spend boundary: equal qualifies', () => {
    const r = priceCart(cart({ lines: [line('a', 1500)], code: pct(10, { minSpendCents: 1500 }) }));
    expect(r.adjustments[0]!.cents).toBe(150);
  });

  it('first-order-only codes are refused to returning customers', () => {
    const c = { lines: [line('a', 1000)], code: pct(10, { firstOrderOnly: true }) };
    expect(priceCart(cart({ ...c, customer: { orderCount: 0 } })).adjustments).toHaveLength(1);
    const r = priceCart(cart({ ...c, customer: { orderCount: 2 } }));
    expect(r.adjustments).toEqual([]);
    expect(r.notices).toEqual([{ key: 'code_first_order_only', refId: 'c1' }]);
  });
});

describe('priceCart: code window uses the injected now', () => {
  const code = pct(10, {
    startsAt: new Date('2026-10-31T12:00:00Z'),
    endsAt: new Date('2026-11-01T00:00:00Z'),
  });
  const run = (now: string) =>
    priceCart(cart({ now: new Date(now), lines: [line('a', 1000)], code }));

  it('refuses before the start', () => {
    expect(run('2026-10-31T11:59:59Z').notices).toEqual([{ key: 'code_not_started', refId: 'c1' }]);
  });
  it('starts exactly at startsAt', () => {
    expect(run('2026-10-31T12:00:00Z').adjustments).toHaveLength(1);
  });
  it('ends exactly at endsAt', () => {
    expect(run('2026-10-31T23:59:59Z').adjustments).toHaveLength(1);
    expect(run('2026-11-01T00:00:00Z').notices).toEqual([{ key: 'code_expired', refId: 'c1' }]);
  });
});

describe('priceCart step 4: shipping', () => {
  const ship = { methodCents: 499, freeOverCents: 4000 };
  it('charges shipping under the threshold', () => {
    const r = priceCart(cart({ lines: [line('a', 3999)], shipping: ship }));
    expect(r.shippingCents).toBe(499);
    expect(r.progress.freeShipping).toMatchObject({
      remainingCents: 1,
      percent: 99,
      reached: false,
    });
  });
  it('free at the threshold', () => {
    const r = priceCart(cart({ lines: [line('a', 4000)], shipping: ship }));
    expect(r.shippingCents).toBe(0);
    expect(r.totalCents).toBe(4000);
    expect(r.progress.freeShipping).toMatchObject({
      remainingCents: 0,
      percent: 100,
      reached: true,
    });
  });
  it('the threshold is measured after the order discount', () => {
    const r = priceCart(cart({ lines: [line('a', 4000)], shipping: ship, code: pct(10) }));
    expect(r.merchandiseCents).toBe(3600);
    expect(r.shippingCents).toBe(499);
  });
  it('fixed-price lines count towards the threshold', () => {
    const r = priceCart(
      cart({ lines: [line('bundle', 4000, { fixedPrice: true })], shipping: ship }),
    );
    expect(r.shippingCents).toBe(0);
  });
  it('no threshold configured: never free, no progress', () => {
    const r = priceCart(cart({ lines: [line('a', 99999)] }));
    expect(r.shippingCents).toBe(500);
    expect(r.progress.freeShipping).toBeNull();
  });
  it('free-shipping code frees it and stacks with a tier', () => {
    const r = priceCart(cart({ lines: [line('a', 8000)], tiers, code: freeShip }));
    expect(r.adjustments.map((a) => a.type)).toEqual(['bulk_tier', 'free_shipping']);
    expect(r.adjustments[1]).toMatchObject({ scope: 'shipping', cents: 500 });
    expect(r.shippingCents).toBe(0);
    expect(r.notices).toEqual([]);
    expect(r.totalCents).toBe(7600);
  });
  it('free-shipping code marks progress reached', () => {
    const r = priceCart(cart({ lines: [line('a', 1000)], shipping: ship, code: freeShip }));
    expect(r.progress.freeShipping).toMatchObject({ reached: true, percent: 100 });
  });
  it('free-shipping code with a min spend not met is refused', () => {
    const r = priceCart(
      cart({ lines: [line('a', 1000)], code: { ...freeShip, minSpendCents: 2000 } }),
    );
    expect(r.shippingCents).toBe(500);
    expect(r.notices).toEqual([{ key: 'code_min_spend', refId: 'c3', cents: 1000 }]);
  });
  it('no adjustment row when shipping was already free by threshold', () => {
    const r = priceCart(cart({ lines: [line('a', 5000)], shipping: ship, code: freeShip }));
    expect(r.adjustments).toEqual([]);
  });
});

describe('priceCart properties', () => {
  function rng(seed: number) {
    let s = seed;
    return (n: number) => {
      s = (s * 1103515245 + 12345) % 2 ** 31;
      return s % n;
    };
  }

  function randomCart(rnd: (n: number) => number): PriceCartInput {
    const lines = Array.from({ length: rnd(6) }, (_, i) => {
      const base = 1 + rnd(9000);
      return line(`v${i}`, base, {
        qty: 1 + rnd(4),
        fixedPrice: rnd(5) === 0,
        onSale: rnd(3) === 0,
        saleCents: Math.max(0, base - rnd(base)),
        memberCents: base - rnd(base),
      });
    });
    const kinds = [pct(1 + rnd(100)), fixed(1 + rnd(20000)), freeShip, undefined];
    return cart({
      lines,
      tiers,
      code: kinds[rnd(4)]
        ? { ...kinds[rnd(4)]!, excludeSaleItems: rnd(2) === 0, minSpendCents: rnd(3000) }
        : undefined,
      customer: { isMember: rnd(2) === 0 },
      shipping: { methodCents: rnd(1500), freeOverCents: rnd(2) ? rnd(20000) : undefined },
    });
  }

  it('line totals + shipping == total; total >= 0; every discount cent allocated exactly once; deterministic', () => {
    const rnd = rng(7);
    for (let k = 0; k < 400; k++) {
      const input = randomCart(rnd);
      const r = priceCart(input);
      expect(r.totalCents).toBeGreaterThanOrEqual(0);
      expect(r.lines.reduce((a, l) => a + l.lineTotalCents, 0) + r.shippingCents).toBe(
        r.totalCents,
      );
      for (const l of r.lines) {
        expect(l.lineTotalCents).toBeGreaterThanOrEqual(0);
        expect(l.lineSubtotalCents - l.lineDiscountCents).toBe(l.lineTotalCents);
        expect(l.appliedPromos.reduce((a, p) => a + p.cents, 0)).toBe(l.lineDiscountCents);
      }
      for (const adj of r.adjustments.filter((a) => a.scope === 'lines')) {
        const allocated = r.lines
          .flatMap((l) => l.appliedPromos)
          .filter((p) => p.refId === adj.refId && p.type === adj.type);
        expect(allocated.reduce((a, p) => a + p.cents, 0)).toBe(adj.cents);
      }
      expect(r.discountCents).toBe(
        r.adjustments.filter((a) => a.scope === 'lines').reduce((a, x) => a + x.cents, 0),
      );
      expect(priceCart(input)).toEqual(r);
    }
  });
});
