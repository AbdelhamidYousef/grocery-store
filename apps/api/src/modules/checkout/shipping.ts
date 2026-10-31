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
  return rule.baseCents + Math.ceil(ctx.weightGrams / 1000) * rule.perKgCents;
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
        currency: ctx.currency ?? 'EUR',
        etaDaysMin: rule.etaDaysMin,
        etaDaysMax: rule.etaDaysMax,
      };
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.code.localeCompare(b.code));
}
