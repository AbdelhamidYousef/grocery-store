// Demo promotions. Every amount is integer cents (EUR). The pricing engine decides how they
// combine; these rows only describe the rules.

export const discountCodeSeeds = [
  {
    code: 'PAWS10',
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

// A free bag of biscuits once the basket reaches EUR 40 (after discounts).
export const giftRuleSeed = { thresholdCents: 4000, variantSku: 'PW-DOG-BISC-PEANUT-200G' };
