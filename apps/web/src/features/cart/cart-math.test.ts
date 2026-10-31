import { describe, expect, it } from 'vitest';

import { makeCart, makeCartItem } from '../../test/fixtures';

import { withLineQuantity } from './cart-math';

describe('withLineQuantity', () => {
  const cart = makeCart([
    makeCartItem({ id: 'l1', unitPriceCents: 1099, quantity: 1, lineTotalCents: 1099 }),
    makeCartItem({ id: 'l2', unitPriceCents: 500, quantity: 2, lineTotalCents: 1000 }),
  ]);

  it('reprices the line and the totals in integer cents', () => {
    const next = withLineQuantity(cart, 'l1', 3);
    expect(next.items[0]).toMatchObject({ quantity: 3, lineTotalCents: 3297 });
    expect(next.subtotalCents).toBe(3297 + 1000);
    expect(next.itemCount).toBe(5);
  });

  it('removes the line at quantity 0', () => {
    const next = withLineQuantity(cart, 'l2', 0);
    expect(next.items.map((i) => i.id)).toEqual(['l1']);
    expect(next.itemCount).toBe(1);
  });

  it('keeps sold-out lines out of the totals', () => {
    const soldOut = makeCart([
      makeCartItem({ id: 'l1', unitPriceCents: 1000, quantity: 1, lineTotalCents: 1000 }),
      makeCartItem({
        id: 'l2',
        available: 0,
        maxQty: 0,
        unitPriceCents: 700,
        quantity: 2,
        lineTotalCents: 1400,
      }),
    ]);
    const next = withLineQuantity(soldOut, 'l1', 2);
    expect(next.subtotalCents).toBe(2000);
    expect(next.itemCount).toBe(2);
  });

  it('does not mutate the cart it was given', () => {
    withLineQuantity(cart, 'l1', 9);
    expect(cart.items[0]?.quantity).toBe(1);
  });
});
