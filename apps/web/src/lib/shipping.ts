// How far a subtotal is from free shipping. The threshold comes from the API's shipping quotes
// (`freeOverCents`, see features/checkout/queries.ts); the cart only shows a hint with it, and
// checkout charges whatever the server computes, so this never affects a price.
export function freeShippingProgress(
  subtotalCents: number,
  thresholdCents: number,
): {
  remainingCents: number;
  percent: number;
} {
  const remainingCents = Math.max(0, thresholdCents - subtotalCents);
  // A zero threshold means "always free": complete, and no division by zero.
  const percent =
    thresholdCents === 0 ? 100 : Math.min(100, Math.floor((subtotalCents * 100) / thresholdCents));
  return { remainingCents, percent };
}
