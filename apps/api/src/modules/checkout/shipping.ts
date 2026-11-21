import { BASKET_RULES, deliveryFeeBeforeFreeCents, type ShippingQuote } from '@store/shared';

// A shipping method is only a delivery KIND now (G9): `slot` or `express`, with a name and an ETA
// for the page. What it costs comes from the basket rules (packages/shared/src/basket-rules.ts), the
// same function the cart and the order use, so this list can never quote another price. The price
// columns of `shipping_methods` stay in the table (old orders were priced with them) and are unused.
export interface ShippingRule {
  code: string;
  name: string;
  etaDaysMin: number;
  etaDaysMax: number;
}

export interface ShippingContext {
  // Accepted so the signature will not change when zones arrive (the route validates it).
  country: string;
  /** Goods after discounts, before credits: what the free-delivery rule looks at. */
  goodsCents: number;
  /** The delivery address is in an outer area (surcharge). */
  outerArea: boolean;
  currency?: string;
}

// The fee a quote shows: express has its own, every other method is a slot (peak is only known once
// a slot is chosen, so the quote is the cheapest slot's). Free only for a slot, from the threshold.
export function quote(rules: ShippingRule[], ctx: ShippingContext): ShippingQuote[] {
  return rules
    .map((rule) => {
      const express = rule.code === 'express';
      const fee = deliveryFeeBeforeFreeCents({
        kind: express ? 'express' : 'slot',
        peak: false,
        outerArea: ctx.outerArea,
      });
      const free = !express && ctx.goodsCents >= BASKET_RULES.freeDeliveryOverCents;
      return {
        code: rule.code,
        name: rule.name,
        priceCents: free ? 0 : fee,
        free,
        freeOverCents: express ? null : BASKET_RULES.freeDeliveryOverCents,
        currency: ctx.currency ?? 'EUR',
        etaDaysMin: rule.etaDaysMin,
        etaDaysMax: rule.etaDaysMax,
      };
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code));
}
