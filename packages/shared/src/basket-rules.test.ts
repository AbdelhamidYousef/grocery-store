import { describe, expect, it } from 'vitest';

import {
  BASKET_RULES,
  bagCount,
  basketTotals,
  deliveryFeeBeforeFreeCents,
  isOuterArea,
  isPeakSlot,
  type BasketContext,
  type BasketLine,
} from './basket-rules.ts';

const NOW = new Date('2026-11-21T10:00:00Z');

const line = (over: Partial<BasketLine> = {}): BasketLine => ({
  variantId: 'v1',
  productId: 'p1',
  qty: 1,
  baseCents: 1000,
  depositCents: 0,
  ...over,
});

const ctx = (over: Partial<BasketContext> = {}): BasketContext => ({
  now: NOW,
  currency: 'EUR',
  delivery: { kind: 'slot', peak: false, outerArea: false },
  bags: true,
  ...over,
});

describe('delivery fee', () => {
  it('slot 2.99, peak +1.00, express 4.99, outer area +0.50', () => {
    const fee = (kind: 'slot' | 'express', peak: boolean, outerArea: boolean) =>
      deliveryFeeBeforeFreeCents({ kind, peak, outerArea });
    expect(fee('slot', false, false)).toBe(299);
    expect(fee('slot', true, false)).toBe(399);
    expect(fee('slot', false, true)).toBe(349);
    expect(fee('slot', true, true)).toBe(449);
    expect(fee('express', false, false)).toBe(499);
    expect(fee('express', true, false)).toBe(499); // peak never applies to express
    expect(fee('express', false, true)).toBe(549);
  });

  it('knows peak slots by shop time (17:00 to 20:00), not the visitor zone', () => {
    // 2026-11-21 is winter time in Berlin (UTC+1).
    expect(isPeakSlot(new Date('2026-11-21T15:59:00Z'))).toBe(false); // 16:59
    expect(isPeakSlot(new Date('2026-11-21T16:00:00Z'))).toBe(true); // 17:00
    expect(isPeakSlot(new Date('2026-11-21T18:00:00Z'))).toBe(true); // 19:00
    expect(isPeakSlot(new Date('2026-11-21T19:00:00Z'))).toBe(false); // 20:00
    // Summer time (UTC+2): 17:00 is 15:00Z.
    expect(isPeakSlot(new Date('2026-07-21T15:00:00Z'))).toBe(true);
    expect(isPeakSlot(new Date('2026-07-21T14:59:00Z'))).toBe(false);
  });

  it('only Neukoelln is an outer area', () => {
    expect(isOuterArea('neukoelln')).toBe(true);
    expect(isOuterArea('mitte')).toBe(false);
    expect(isOuterArea(null)).toBe(false);
  });
});

describe('bags', () => {
  it('is ceil(units / 8), 0.25 each', () => {
    expect([0, 1, 8, 9, 16, 17].map(bagCount)).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it('costs nothing with "No bags, use boxes"', () => {
    const t = basketTotals([line({ qty: 9, baseCents: 500 })], ctx({ bags: false }));
    expect(t.bagCount).toBe(0);
    expect(t.bagFeeCents).toBe(0);
    expect(t.totalCents).toBe(9 * 500 + 299);
  });

  it('counts units, not lines', () => {
    const t = basketTotals(
      [line({ qty: 5 }), line({ variantId: 'v2', productId: 'p2', qty: 4, baseCents: 300 })],
      ctx(),
    );
    expect(t.bagCount).toBe(2);
    expect(t.bagFeeCents).toBe(2 * BASKET_RULES.bagFeeCents);
  });
});

describe('minimum order', () => {
  it('blocks below 15.00 and says what is missing', () => {
    const t = basketTotals([line({ baseCents: 1180 })], ctx());
    expect(t.minimumOrder).toEqual({ minCents: 1500, missingCents: 320, met: false });
    expect(t.canCheckout).toBe(false);
  });

  it('lets exactly 15.00 through', () => {
    const t = basketTotals([line({ baseCents: 1500 })], ctx());
    expect(t.minimumOrder.met).toBe(true);
    expect(t.minimumOrder.missingCents).toBe(0);
    expect(t.canCheckout).toBe(true);
  });

  it('does not count the deposit', () => {
    // 14.00 of goods + 2.00 of deposit is 16.00 on the card but still under the minimum.
    const t = basketTotals([line({ qty: 8, baseCents: 175, depositCents: 25 })], ctx());
    expect(t.goodsCents).toBe(1400);
    expect(t.depositCents).toBe(200);
    expect(t.canCheckout).toBe(false);
    expect(t.minimumOrder.missingCents).toBe(100);
  });

  it('counts a weighed estimate and a short-dated price as goods', () => {
    // A weighed line arrives as its estimate in baseCents (one unit "about 500 g"), a short-dated
    // line at its reduced price: the engine sees plain prices.
    const t = basketTotals(
      [
        line({ variantId: 'w', baseCents: 756, qty: 1 }),
        line({ variantId: 's', baseCents: 749, qty: 1, fixedPrice: true }),
      ],
      ctx(),
    );
    expect(t.goodsCents).toBe(1505);
    expect(t.minimumOrder.met).toBe(true);
  });

  it('looks at goods after a discount, so a code can push a basket under it', () => {
    const t = basketTotals(
      [line({ baseCents: 1600 })],
      ctx({
        code: { id: 'c', code: 'TEN', kind: 'percent', value: 10 },
      }),
    );
    expect(t.goodsCents).toBe(1440);
    expect(t.minimumOrder.met).toBe(false);
    expect(t.minimumOrder.missingCents).toBe(60);
  });

  it('an empty basket cannot be paid for and has no fee', () => {
    const t = basketTotals([], ctx());
    expect(t.canCheckout).toBe(false);
    expect(t.totalCents).toBe(0);
    expect(t.deliveryFeeCents).toBe(0);
  });
});

describe('free delivery', () => {
  it('is free from exactly 49.00 of goods for a slot', () => {
    const at = basketTotals([line({ baseCents: 4900 })], ctx());
    expect(at.deliveryFree).toBe(true);
    expect(at.deliveryFeeCents).toBe(0);
    expect(at.deliveryFeeBeforeFreeCents).toBe(299);
    expect(at.freeDelivery).toMatchObject({ reached: true, missingCents: 0, percent: 100 });
    const under = basketTotals([line({ baseCents: 4899 })], ctx());
    expect(under.deliveryFree).toBe(false);
    expect(under.deliveryFeeCents).toBe(299);
    expect(under.freeDelivery).toMatchObject({ reached: false, missingCents: 1 });
  });

  it('waives the peak and outer-area surcharges too', () => {
    const t = basketTotals(
      [line({ baseCents: 5000 })],
      ctx({ delivery: { kind: 'slot', peak: true, outerArea: true } }),
    );
    expect(t.deliveryFeeCents).toBe(0);
    expect(t.deliveryFeeBeforeFreeCents).toBe(449);
  });

  it('does not count the deposit towards the threshold', () => {
    // 48.00 goods + 2.50 deposit = 50.50 on the card, but delivery is still charged.
    const t = basketTotals([line({ qty: 10, baseCents: 480, depositCents: 25 })], ctx());
    expect(t.goodsCents).toBe(4800);
    expect(t.depositCents).toBe(250);
    expect(t.deliveryFeeCents).toBe(299);
    expect(t.freeDelivery?.missingCents).toBe(100);
  });

  it('never makes express free, whatever the basket or a free-shipping code', () => {
    const express = ctx({ delivery: { kind: 'express', peak: false, outerArea: false } });
    const big = basketTotals([line({ baseCents: 20000 })], express);
    expect(big.deliveryFeeCents).toBe(499);
    expect(big.deliveryFree).toBe(false);
    expect(big.freeDelivery).toBeNull();
    const code = basketTotals([line({ baseCents: 20000 })], {
      ...express,
      code: { id: 'f', code: 'FREESHIP', kind: 'free_shipping' },
    });
    expect(code.deliveryFeeCents).toBe(499);
    expect(code.priced.adjustments.some((a) => a.scope === 'shipping')).toBe(false);
  });

  it('a free-shipping code still frees a slot', () => {
    const t = basketTotals(
      [line({ baseCents: 2000 })],
      ctx({ code: { id: 'f', code: 'FREESHIP', kind: 'free_shipping' } }),
    );
    expect(t.deliveryFeeCents).toBe(0);
  });

  it('judges the threshold on goods after discounts', () => {
    const t = basketTotals(
      [line({ baseCents: 5000 })],
      ctx({ code: { id: 'c', code: 'TEN', kind: 'percent', value: 10 } }),
    );
    expect(t.goodsCents).toBe(4500);
    expect(t.deliveryFeeCents).toBe(299);
  });
});

describe('deposit', () => {
  it('is its own line, per unit, and never discounted', () => {
    const t = basketTotals(
      [line({ qty: 6, baseCents: 1000, depositCents: 25 })],
      ctx({ code: { id: 'c', code: 'TEN', kind: 'percent', value: 10 } }),
    );
    expect(t.depositCents).toBe(150);
    expect(t.discountCents).toBe(600); // 10 % of 60.00 of goods, not of the deposit
    expect(t.merchandiseCents).toBe(5400);
  });

  it('is not part of a bulk tier base either', () => {
    const t = basketTotals(
      [line({ qty: 4, baseCents: 1000, depositCents: 25 })],
      ctx({ tiers: [{ id: 't', minCents: 4050, percent: 10 }] }),
    );
    // 40.00 of goods is below 40.50 even though 40.00 + 1.00 deposit is above it.
    expect(t.discountCents).toBe(0);
  });
});

describe('the bill adds up', () => {
  it('total = goods after discount + deposit + bags + delivery + donation', () => {
    const t = basketTotals(
      [
        line({ qty: 3, baseCents: 399, depositCents: 25 }),
        line({ variantId: 'v2', productId: 'p2', qty: 12, baseCents: 215 }),
      ],
      ctx({
        delivery: { kind: 'slot', peak: true, outerArea: true },
        tiers: [{ id: 't', minCents: 3000, percent: 5 }],
        roundUpDonation: true,
      }),
    );
    expect(t.bagCount).toBe(2);
    expect(t.totalCents).toBe(
      t.merchandiseCents + t.depositCents + t.bagFeeCents + t.deliveryFeeCents + t.donationCents,
    );
    expect(t.totalCents % 100).toBe(0); // the donation rounded the card up to a whole euro
    expect(t.subtotalCents - t.discountCents).toBe(t.merchandiseCents);
  });

  it('credits reduce the goods, never the fees, and never the minimum or the free threshold', () => {
    const t = basketTotals(
      [line({ baseCents: 4900, depositCents: 0 })],
      ctx({
        credits: [{ type: 'points', refId: 'p', label: 'Points', cents: 1000 }],
      }),
    );
    expect(t.goodsCents).toBe(4900); // credits are taken after the thresholds
    expect(t.deliveryFeeCents).toBe(0);
    expect(t.merchandiseCents).toBe(3900);
    expect(t.minimumOrder.met).toBe(true);
  });

  it('estimates the slot fee before a delivery time is chosen', () => {
    const t = basketTotals(
      [line({ baseCents: 2000 })],
      ctx({ delivery: { kind: null, peak: true, outerArea: false } }),
    );
    expect(t.deliveryEstimated).toBe(true);
    expect(t.deliveryFeeCents).toBe(299); // cheapest slot: peak unknown, not charged
  });
});
