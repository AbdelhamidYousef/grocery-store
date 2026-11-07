import type { ShippingQuote } from '@store/shared';

// The shape of a `shipping_methods` row that pricing needs; kept separate from Drizzle's row type
// so this file stays pure (no database import) and trivially unit-testable.
export interface ShippingRule {
  code: string;
  name: string;
  baseCents: number;
  perKgCents: number;
  freeOverCents: number | null;
  etaDaysMin: number;
  etaDaysMax: number;
}

export interface ShippingContext {
  // Accepted so the signature will not change when zones arrive, but every supported country is
  // one zone today, so it does not influence the price (the route still validates it).
  country: string;
  /** Weight of the purchasable lines. */
  weightGrams: number;
  /** Subtotal of the purchasable lines, before shipping. */
  subtotalCents: number;
  currency?: string;
}

// price = base + (started kilograms) x per-kg, or 0 once the subtotal reaches the free threshold.
// Carriers bill per started kilogram, hence ceil: 1 g and 1000 g cost the same, 1001 g costs more.
export function shippingPriceCents(
  rule: ShippingRule,
  ctx: Pick<ShippingContext, 'weightGrams' | 'subtotalCents'>,
): number {
  if (rule.freeOverCents !== null && ctx.subtotalCents >= rule.freeOverCents) return 0;
  return priceBeforeThreshold(rule, ctx.weightGrams);
}

// The price ignoring the free threshold: what the pricing engine is given, since it applies the
// threshold itself, to the merchandise total after discounts.
export function priceBeforeThreshold(rule: ShippingRule, weightGrams: number): number {
  return rule.baseCents + Math.ceil(weightGrams / 1000) * rule.perKgCents;
}

// The method the cart estimates with: standard delivery, or the cheapest one if it is switched off.
export function estimateRule<T extends ShippingRule>(rules: T[]): T | undefined {
  return (
    rules.find((r) => r.code === 'standard') ??
    [...rules].sort((a, b) => a.baseCents - b.baseCents || a.code.localeCompare(b.code))[0]
  );
}

// Cheapest first, ties broken by code so the order never flickers between requests.
export function quote(rules: ShippingRule[], ctx: ShippingContext): ShippingQuote[] {
  return rules
    .map((rule) => {
      const priceCents = shippingPriceCents(rule, ctx);
      return {
        code: rule.code,
        name: rule.name,
        priceCents,
        free: priceCents === 0,
        freeOverCents: rule.freeOverCents,
        currency: ctx.currency ?? 'EUR',
        etaDaysMin: rule.etaDaysMin,
        etaDaysMax: rule.etaDaysMax,
      };
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code));
}
