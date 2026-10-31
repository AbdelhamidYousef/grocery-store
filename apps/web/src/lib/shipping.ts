// Free standard shipping starts here. It mirrors `freeOverCents` of the seeded "standard" shipping
// method (apps/api/src/db/seed/shipping.ts); the cart can only show a hint for it. The checkout
// phase reads the real per-method quotes from `GET /checkout/shipping-methods` and decides what
// is charged, so this constant never affects a price.
export const FREE_SHIPPING_OVER_CENTS = 4900;

export function freeShippingProgress(subtotalCents: number): {
  remainingCents: number;
  percent: number;
} {
  const remainingCents = Math.max(0, FREE_SHIPPING_OVER_CENTS - subtotalCents);
  const percent = Math.min(100, Math.floor((subtotalCents * 100) / FREE_SHIPPING_OVER_CENTS));
  return { remainingCents, percent };
}
