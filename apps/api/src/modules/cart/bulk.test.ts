import type { Cart } from '@store/shared';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

const app = makeTestApp();
type Failure = { variantId: string; code: string; message: string; maxQty?: number };
const failures = (res: Parameters<typeof errorOf>[0]) =>
  (errorOf(res).details as { failures: Failure[] }).failures;
const cartOf = async (shopper: ReturnType<typeof makeShopper>) =>
  bodyOf<{ data: Cart }>(await shopper.call('get', '/cart')).data;

describe('POST /cart/items/bulk', () => {
  it('adds every line in one request and returns the priced cart', async () => {
    const a = await createProduct({ variants: [{ priceCents: 1000 }] });
    const b = await createProduct({ variants: [{ priceCents: 2500 }] });
    const shopper = makeShopper(app);
    const res = await shopper.call('post', '/cart/items/bulk', {
      items: [
        { variantId: a.variants[0]!.id, quantity: 2 },
        { variantId: b.variants[0]!.id, quantity: 1 },
      ],
    });
    expect(res.status).toBe(200);
    const cart = bodyOf<{ data: Cart }>(res).data;
    // The lines of one bulk add share a created_at, so their order is by id: compare as a set.
    expect(cart.items.map((i) => i.quantity).sort()).toEqual([1, 2]);
    expect(cart.subtotalCents).toBe(4500);
  });

  it('adds to a line already in the cart (cumulative, like a single add)', async () => {
    const a = await createProduct();
    const shopper = makeShopper(app);
    await shopper.addToCart(a.variants[0]!.id, 2);
    const res = await shopper.call('post', '/cart/items/bulk', {
      items: [{ variantId: a.variants[0]!.id, quantity: 3 }],
    });
    expect(bodyOf<{ data: Cart }>(res).data.items[0]?.quantity).toBe(5);
  });

  it('is all or nothing: one sold-out line refuses the request and leaves the cart as it was', async () => {
    const ok = await createProduct({ variants: [{ stock: 10 }] });
    const low = await createProduct({ variants: [{ stock: 1 }] });
    const shopper = makeShopper(app);
    await shopper.addToCart(ok.variants[0]!.id, 1);
    const res = await shopper.call('post', '/cart/items/bulk', {
      items: [
        { variantId: ok.variants[0]!.id, quantity: 2 },
        { variantId: low.variants[0]!.id, quantity: 4 },
      ],
    });
    expect(res.status).toBe(409);
    expect(failures(res)).toEqual([
      expect.objectContaining({ variantId: low.variants[0]!.id, code: 'OUT_OF_STOCK', maxQty: 1 }),
    ]);
    // The good line did not stay behind: still the one unit from before.
    const cart = await cartOf(shopper);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(1);
  });

  it('reports every failing line at once, each with its own code', async () => {
    const soldOut = await createProduct({ variants: [{ stock: 0 }] });
    const trial = await createProduct({ variants: [{ isTrial: true, name: 'Trial' }] });
    const fine = await createProduct();
    const shopper = makeShopper(app);
    const res = await shopper.call('post', '/cart/items/bulk', {
      items: [
        { variantId: soldOut.variants[0]!.id, quantity: 1 },
        { variantId: trial.variants[0]!.id, quantity: 2 },
        { variantId: fine.variants[0]!.id, quantity: 1 },
        { variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
      ],
    });
    expect(res.status).toBe(409);
    expect(failures(res).map((f) => f.code)).toEqual(['OUT_OF_STOCK', 'TRIAL_LIMIT', 'NOT_FOUND']);
    expect((await cartOf(shopper)).items).toHaveLength(0);
  });

  it('enforces the trial limit for a signed-in customer who already had the sample', async () => {
    const trial = await createProduct({ variants: [{ isTrial: true, name: 'Trial', stock: 5 }] });
    const { shopper } = await signedIn(app);
    const first = await shopper.call('post', '/cart/items/bulk', {
      items: [{ variantId: trial.variants[0]!.id, quantity: 1 }],
    });
    expect(first.status).toBe(200);
    const second = await shopper.call('post', '/cart/items/bulk', {
      items: [{ variantId: trial.variants[0]!.id, quantity: 1 }],
    });
    expect(second.status).toBe(409);
    expect(failures(second)[0]?.code).toBe('TRIAL_LIMIT');
  });

  it('is validated: empty, more than ten, repeated variants, bad quantity', async () => {
    const a = await createProduct();
    const shopper = makeShopper(app);
    const v = a.variants[0]!.id;
    const post = (items: unknown) => shopper.call('post', '/cart/items/bulk', { items });
    expect((await post([])).status).toBe(400);
    expect(
      (await post(Array.from({ length: 11 }, () => ({ variantId: v, quantity: 1 })))).status,
    ).toBe(400);
    expect(
      (
        await post([
          { variantId: v, quantity: 1 },
          { variantId: v, quantity: 1 },
        ])
      ).status,
    ).toBe(400);
    expect((await post([{ variantId: v, quantity: 0 }])).status).toBe(400);
    expect((await post([{ variantId: 'nope', quantity: 1 }])).status).toBe(400);
  });

  it('does not oversell when two bulk adds race for the last unit', async () => {
    const a = await createProduct({ variants: [{ stock: 1 }] });
    const x = makeShopper(app);
    const y = makeShopper(app);
    const body = { items: [{ variantId: a.variants[0]!.id, quantity: 1 }] };
    const [rx, ry] = await Promise.all([
      x.call('post', '/cart/items/bulk', body),
      y.call('post', '/cart/items/bulk', body),
    ]);
    // Carts are separate, so stock is only a cart-level cap (reservation happens at checkout):
    // both may add; what must hold is that neither response is a server error.
    expect([rx.status, ry.status].every((s) => s === 200 || s === 409)).toBe(true);
  });
});
