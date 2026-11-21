// Demo promotions. Every amount is integer minor units: all in EUR (the shop sells in one currency). The pricing engine decides how they
// combine; these rows only describe the rules.

export const discountCodeSeeds = [
  {
    code: 'GROCERY10',
    kind: 'percent' as const,
    value: 10,
    minSpendCents: 3000,
    excludeSaleItems: true,
  },
  {
    // A first-order welcome: one use per customer.
    code: 'WELCOME5',
    kind: 'fixed' as const,
    value: 500,
    minSpendCents: 2000,
    firstOrderOnly: true,
    perCustomerMax: 1,
  },
  {
    code: 'FREESHIP',
    kind: 'free_shipping' as const,
    value: 0,
    minSpendCents: 2500,
  },
];

// Spend more, save more: the engine applies a tier OR a code, whichever saves more.
export const bulkTierSeeds = [
  { minCents: 7500, percent: 5 },
  { minCents: 10000, percent: 10 },
];

// A free pack of butter biscuits once the basket reaches EUR 40 (after discounts).
export const giftRuleSeed = {
  thresholdCents: 4000,
  variantSku: 'GR-BUTTER-BISCUITS',
};

// Member prices (step 18.7): about 10% below the regular price, rounded to whole cents with
// integer maths only. The seed gives them to a handful of ordinary variants (never a trial size).
export const MEMBER_PRICE_VARIANTS = 8;
export const MEMBER_MIN_PRICE_CENTS = 100;

export function memberPriceCents(priceCents: number): number {
  // price - round(price * 10%), halves rounded up: (price * 10 + 50) / 100 in integers.
  return priceCents - Math.floor((priceCents * 10 + 50) / 100);
}

// Every n-th eligible variant by SKU, so the choice is stable across re-seeds and spread over the
// catalogue instead of clustering in one category.
export function pickMemberVariants<T extends { sku: string; priceCents: number; isTrial: boolean }>(
  variants: T[],
): T[] {
  const eligible = variants
    .filter((v) => !v.isTrial && v.priceCents >= MEMBER_MIN_PRICE_CENTS)
    .sort((a, b) => a.sku.localeCompare(b.sku));
  const step = Math.max(1, Math.floor(eligible.length / MEMBER_PRICE_VARIANTS));
  return eligible.filter((_, i) => i % step === 0).slice(0, MEMBER_PRICE_VARIANTS);
}
