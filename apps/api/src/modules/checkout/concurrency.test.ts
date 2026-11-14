import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { inventory, orders } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { errorOf } from '../../test/http.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';

let stripe: FakeStripe;
let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  stripe = new FakeStripe();
  app = makeTestApp({ payments: stripe });
  await createShippingMethods();
});

const body = {
  email: 'ada@grocery.test',
  shippingAddress: {
    fullName: 'Ada Lovelace',
    line1: '1 Bone Street',
    city: 'Riga',
    postalCode: 'LV-1010',
    country: 'DE',
  },
  shippingMethodCode: 'standard',
};

const stockOf = async (variantId: string) => {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
  return { quantity: row!.quantity, reserved: row!.reserved };
};

// Everybody fills a cart first (calm, sequential), then everybody presses "pay" in the same instant.
async function shoppersWith(
  lines: { variantId: string; quantity: number }[][],
): Promise<Shopper[]> {
  const shoppers: Shopper[] = [];
  for (const cartLines of lines) {
    const shopper = makeShopper(app);
    for (const line of cartLines) await shopper.addToCart(line.variantId, line.quantity);
    shoppers.push(shopper);
  }
  return shoppers;
}

describe('concurrent checkouts', () => {
  it('lets exactly as many shoppers win as there are units: 8 carts, 3 units, 1 each', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 3 }] });
    const id = variants[0]!.id;
    const shoppers = await shoppersWith(
      Array.from({ length: 8 }, () => [{ variantId: id, quantity: 1 }]),
    );

    const results = await Promise.all(shoppers.map((s) => s.call('post', '/checkout', body)));

    const won = results.filter((r) => r.status === 200);
    const lost = results.filter((r) => r.status !== 200);
    expect(won).toHaveLength(3);
    expect(lost).toHaveLength(5);
    for (const r of lost) {
      expect(r.status).toBe(409);
      expect(['CART_CHANGED', 'OUT_OF_STOCK']).toContain(errorOf(r).code);
    }
    // The shelf is exactly full of promises and nothing went negative.
    expect(await stockOf(id)).toEqual({ quantity: 3, reserved: 3 });
    expect(await db.select().from(orders)).toHaveLength(3);
    expect(stripe.intents.size).toBe(3);
  });

  it('never oversells with mixed quantities: 3 carts of 2 units, 5 in stock', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 5 }] });
    const id = variants[0]!.id;
    const shoppers = await shoppersWith(
      Array.from({ length: 3 }, () => [{ variantId: id, quantity: 2 }]),
    );
    const results = await Promise.all(shoppers.map((s) => s.call('post', '/checkout', body)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await stockOf(id)).toEqual({ quantity: 5, reserved: 4 });
  });

  it('does not deadlock when carts hold the same variants in opposite order', async () => {
    const { variants: a } = await createProduct({ variants: [{ stock: 100 }] });
    const { variants: b } = await createProduct({ variants: [{ stock: 100 }] });
    const ab = [
      { variantId: a[0]!.id, quantity: 1 },
      { variantId: b[0]!.id, quantity: 1 },
    ];
    const ba = [...ab].reverse();
    const shoppers = await shoppersWith(
      Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? ab : ba)),
    );

    const results = await Promise.all(shoppers.map((s) => s.call('post', '/checkout', body)));

    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    expect(await stockOf(a[0]!.id)).toEqual({ quantity: 100, reserved: 8 });
    expect(await stockOf(b[0]!.id)).toEqual({ quantity: 100, reserved: 8 });
  });

  it('turns a burst of identical requests on one cart into one order and one intent', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 10 }] });
    const [shopper] = await shoppersWith([[{ variantId: variants[0]!.id, quantity: 2 }]]);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => shopper!.call('post', '/checkout', body)),
    );

    expect(results.map((r) => r.status)).toEqual(Array(5).fill(200));
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(stripe.intents.size).toBe(1);
    expect(await stockOf(variants[0]!.id)).toEqual({ quantity: 10, reserved: 2 });
  });
});
