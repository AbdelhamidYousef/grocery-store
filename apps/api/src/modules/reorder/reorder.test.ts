import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { inventory, orders } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { signedIn, simulate, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp();
  await createShippingMethods();
});

type Customer = Awaited<ReturnType<typeof signedIn>>;
// An order with the given variants (qty each), paid unless `pay` is false.
async function order(c: Customer, lines: { id: string; qty: number }[], pay = true) {
  for (const l of lines) await c.shopper.addToCart(l.id, l.qty);
  const res = await c.shopper.call('post', '/checkout', {
    email: c.user.email,
    shippingAddress: TEST_ADDRESS,
    shippingMethodCode: 'standard',
  });
  expect(res.status).toBe(200);
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  if (pay) await simulate(app, number).expect(200);
  const [row] = await db.select().from(orders).where(eq(orders.number, number));
  return row!;
}
const variantOf = async (stock = 20, priceCents = 1500, name?: string) => {
  const { variants, product } = await createProduct({
    ...(name && { name }),
    variants: [{ priceCents, stock }],
  });
  return { id: variants[0]!.id, productId: product.id };
};
type Item = {
  variantId: string;
  name: string;
  priceCents: number;
  available: boolean;
  timesBought: number;
};
const buyAgain = async (c: Customer) =>
  bodyOf<{ data: Item[] }>(await c.shopper.call('get', '/me/buy-again')).data;

describe('GET /me/buy-again', () => {
  it('answers 401 to a guest', async () => {
    expect((await makeShopper(app).call('get', '/me/buy-again')).status).toBe(401);
  });

  it("lists distinct variants from paid orders, newest first, with today's price", async () => {
    const c = await signedIn(app);
    const a = await variantOf(20, 1000, 'Alpha');
    const b = await variantOf(20, 2000, 'Beta');
    await order(c, [{ id: a.id, qty: 1 }]);
    await order(c, [{ id: b.id, qty: 1 }]);
    await order(c, [{ id: a.id, qty: 2 }]);
    // the catalogue price changed since: the list shows the current one
    const { productVariants } = await import('../../db/schema/index.ts');
    await db.update(productVariants).set({ priceCents: 1100 }).where(eq(productVariants.id, a.id));
    const list = await buyAgain(c);
    expect(list.map((i) => i.name)).toEqual(['Alpha', 'Beta']);
    expect(list[0]).toMatchObject({ priceCents: 1100, timesBought: 2, available: true });
  });

  it('ignores unpaid orders and other customers, and flags sold-out variants', async () => {
    const c = await signedIn(app);
    const other = await signedIn(app);
    const a = await variantOf();
    const b = await variantOf(5, 900, 'Unpaid');
    await order(c, [{ id: a.id, qty: 1 }]);
    await order(c, [{ id: b.id, qty: 1 }], false);
    await order(other, [{ id: (await variantOf()).id, qty: 1 }]);
    await db.update(inventory).set({ quantity: 0 }).where(eq(inventory.variantId, a.id));
    const list = await buyAgain(c);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ variantId: a.id, available: false });
  });
});

describe('POST /me/orders/:id/reorder', () => {
  it('adds every available line and reports the skipped ones, never failing the lot', async () => {
    const c = await signedIn(app);
    const ok = await variantOf(20, 1000, 'Fine');
    const gone = await variantOf(20, 1000, 'Gone');
    const last = await variantOf(20, 1000, 'Sold out later');
    const past = await order(c, [
      { id: ok.id, qty: 2 },
      { id: gone.id, qty: 1 },
      { id: last.id, qty: 1 },
    ]);
    const { productVariants } = await import('../../db/schema/index.ts');
    await db
      .update(productVariants)
      .set({ status: 'archived' })
      .where(eq(productVariants.id, gone.id));
    await db.update(inventory).set({ quantity: 0 }).where(eq(inventory.variantId, last.id));

    const res = await c.shopper.call('post', `/me/orders/${past.id}/reorder`);
    expect(res.status).toBe(200);
    const data = bodyOf<{
      data: {
        cart: { items: { variantId: string; quantity: number }[] };
        added: { name: string; quantity: number }[];
        skipped: { name: string; reason: string }[];
      };
    }>(res).data;
    expect(data.added.map((a) => [a.name, a.quantity])).toEqual([['Fine', 2]]);
    expect(data.skipped.map((s) => s.reason).sort()).toEqual(['sold_out', 'unavailable']);
    expect(data.cart.items).toHaveLength(1);
    expect(data.cart.items[0]).toMatchObject({ variantId: ok.id, quantity: 2 });
  });

  it('accepts the order number as well as the id', async () => {
    const c = await signedIn(app);
    const v = await variantOf();
    const past = await order(c, [{ id: v.id, qty: 1 }]);
    const res = await c.shopper.call('post', `/me/orders/${past.number}/reorder`);
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { added: unknown[] } }>(res).data.added).toHaveLength(1);
  });

  it("404s for someone else's order, an unpaid one and an unknown id; 401 for a guest", async () => {
    const c = await signedIn(app);
    const other = await signedIn(app);
    const v = await variantOf();
    const theirs = await order(other, [{ id: v.id, qty: 1 }]);
    const unpaid = await order(c, [{ id: (await variantOf()).id, qty: 1 }], false);
    expect((await c.shopper.call('post', `/me/orders/${theirs.id}/reorder`)).status).toBe(404);
    expect((await c.shopper.call('post', `/me/orders/${unpaid.id}/reorder`)).status).toBe(404);
    expect(
      (await c.shopper.call('post', '/me/orders/00000000-0000-4000-8000-000000000000/reorder'))
        .status,
    ).toBe(404);
    expect((await makeShopper(app).call('post', `/me/orders/${theirs.id}/reorder`)).status).toBe(
      401,
    );
  });
});
