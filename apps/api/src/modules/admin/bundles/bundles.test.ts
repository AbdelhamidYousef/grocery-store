import type { Cart, ProductDetail } from '@store/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../../db/client.ts';
import {
  bundleItems,
  inventory,
  orders,
  productVariants,
  products,
} from '../../../db/schema/index.ts';
import { makeTestApp } from '../../../test/app.ts';
import { createProduct, createShippingMethods } from '../../../test/factories.ts';
import { FakeStripe } from '../../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../../test/http.ts';
import { signedIn } from '../../../test/orders.ts';
import { makeShopper, type Shopper } from '../../../test/shopper.ts';
import { cancelPendingOrder } from '../../checkout/orders.ts';
import * as checkoutRepo from '../../checkout/repo.ts';
import { applyTransition } from '../../orders/transition.ts';

const app = makeTestApp({ payments: new FakeStripe() });
let admin: Shopper;
beforeEach(async () => {
  admin = (await signedIn(app, 'admin', 'boss@pawsome.test')).shopper;
  await createShippingMethods();
});

const data = <T>(res: Parameters<typeof bodyOf>[0]) => bodyOf<{ data: T }>(res).data;
type Bundle = {
  variantId: string;
  slug: string;
  priceCents: number;
  individualCents: number;
  savingCents: number;
  available: number;
  components: { variantId: string; qty: number }[];
};

// Two ordinary products (rope 1000, ball 500) and a kit of 2 ropes + 1 ball priced 2200.
async function makeKit(opts: { ropeStock?: number; ballStock?: number; price?: number } = {}) {
  const rope = await createProduct({
    name: 'Rope',
    variants: [{ priceCents: 1000, stock: opts.ropeStock ?? 10 }],
  });
  const ball = await createProduct({
    name: 'Ball',
    variants: [{ priceCents: 500, stock: opts.ballStock ?? 10 }],
  });
  const res = await admin.call('post', '/admin/bundles', {
    name: 'Play Kit',
    slug: 'play-kit',
    description: 'A rope and a ball.',
    priceCents: opts.price ?? 2200,
    components: [
      { variantId: rope.variants[0]!.id, qty: 2 },
      { variantId: ball.variants[0]!.id, qty: 1 },
    ],
  });
  return { rope, ball, res };
}

const stockOf = async (variantId: string) => {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
  return row && { quantity: row.quantity, reserved: row.reserved };
};

describe('admin bundles', () => {
  it('is for admins only', async () => {
    expect((await makeShopper(app).call('get', '/admin/bundles')).status).toBe(401);
    const customer = (await signedIn(app, 'customer', 'sam@pawsome.test')).shopper;
    expect((await customer.call('get', '/admin/bundles')).status).toBe(403);
  });

  it('creates a kit and derives its saving and availability from the components', async () => {
    const { res } = await makeKit({ ropeStock: 9, ballStock: 10 });
    expect(res.status).toBe(201);
    expect(data<Bundle>(res)).toMatchObject({
      priceCents: 2200,
      individualCents: 2500,
      savingCents: 300,
      // floor(9 / 2) = 4 kits from the ropes, 10 from the balls.
      available: 4,
    });
    const list = data<Bundle[]>(await admin.call('get', '/admin/bundles'));
    expect(list.map((b) => b.slug)).toEqual(['play-kit']);
    // The kit has no stock row of its own.
    expect(await stockOf(list[0]!.variantId)).toBeUndefined();
  });

  it('refuses a kit that is not cheaper than its parts', async () => {
    const { res } = await makeKit({ price: 2500 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(errorOf(res).details)).toContain('lower than its parts');
  });

  it('refuses a kit inside a kit, and a kit with one part', async () => {
    const { res, rope } = await makeKit();
    const inner = data<Bundle>(res);
    const other = await createProduct({ variants: [{ priceCents: 800 }] });
    const nested = await admin.call('post', '/admin/bundles', {
      name: 'Big Kit',
      slug: 'big-kit',
      description: 'Nested.',
      priceCents: 100,
      components: [
        { variantId: inner.variantId, qty: 1 },
        { variantId: other.variants[0]!.id, qty: 1 },
      ],
    });
    expect(nested.status).toBe(400);
    expect(JSON.stringify(errorOf(nested).details)).toContain('another kit');
    const single = await admin.call('post', '/admin/bundles', {
      name: 'One',
      slug: 'one',
      description: 'One part.',
      priceCents: 100,
      components: [{ variantId: rope.variants[0]!.id, qty: 1 }],
    });
    expect(single.status).toBe(400);
  });

  it('updates the price and parts, refuses a bad price, and archives a kit', async () => {
    const { res, rope, ball } = await makeKit();
    const kit = data<Bundle>(res);
    const parts = [
      { variantId: rope.variants[0]!.id, qty: 1 },
      { variantId: ball.variants[0]!.id, qty: 2 },
    ];
    const patched = await admin.call('patch', `/admin/bundles/${kit.variantId}`, {
      priceCents: 1900,
      components: parts,
    });
    expect(data<Bundle>(patched)).toMatchObject({ priceCents: 1900, individualCents: 2000 });
    // 2000 is not below 2000: refused.
    const bad = await admin.call('patch', `/admin/bundles/${kit.variantId}`, {
      priceCents: 2000,
      components: parts,
    });
    expect(bad.status).toBe(400);
    expect((await admin.call('delete', `/admin/bundles/${kit.variantId}`)).status).toBe(200);
    expect(data<Bundle[]>(await admin.call('get', '/admin/bundles'))).toEqual([]);
  });
});

describe('kits on the storefront', () => {
  it('shows what is inside on the kit page and the kit on its components', async () => {
    const { rope } = await makeKit();
    const shopper = makeShopper(app);
    const kitPage = data<ProductDetail>(await shopper.call('get', '/products/play-kit'));
    expect(kitPage.bundle).toMatchObject({ individualCents: 2500, savingCents: 300 });
    expect(kitPage.bundle?.components.map((c) => [c.productName, c.qty])).toEqual([
      ['Ball', 1],
      ['Rope', 2],
    ]);
    expect(kitPage.kits).toEqual([]);

    const ropePage = data<ProductDetail>(
      await shopper.call('get', `/products/${rope.product.slug}`),
    );
    expect(ropePage.bundle).toBeNull();
    expect(ropePage.kits).toMatchObject([
      { slug: 'play-kit', priceCents: 2200, savingCents: 300, available: true },
    ]);
    expect(ropePage.kits[0]?.contents).toBe('Ball, 2 x Rope');
  });

  it('marks the kit sold out when a component runs out', async () => {
    await makeKit({ ropeStock: 1 });
    const page = data<ProductDetail>(await makeShopper(app).call('get', '/products/play-kit'));
    expect(page.variants[0]?.available).toBe(false);
    expect(page.inStock).toBe(false);
  });
});

describe('kits in the cart and checkout', () => {
  const checkout = (shopper: Shopper) =>
    shopper.call('post', '/checkout', {
      email: 'ada@pawsome.test',
      shippingAddress: {
        fullName: 'Ada Lovelace',
        line1: '1 Bone Street',
        city: 'Riga',
        postalCode: 'LV-1010',
        country: 'LV',
      },
      shippingMethodCode: 'standard',
    });

  it('limits the quantity by the scarcest component', async () => {
    const { res } = await makeKit({ ropeStock: 5 });
    const kit = data<Bundle>(res);
    const shopper = makeShopper(app);
    expect((await shopper.addToCart(kit.variantId, 2)).status).toBe(200);
    // 5 ropes allow 2 kits, not 3.
    expect((await shopper.addToCart(kit.variantId, 1)).status).toBe(409);
  });

  it('reserves the components, not the kit, and gives them back when the order is cancelled', async () => {
    const { res, rope, ball } = await makeKit();
    const kit = data<Bundle>(res);
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 2);
    const cart = data<Cart>(await shopper.call('get', '/cart'));
    expect(cart.subtotalCents).toBe(4400);

    expect((await checkout(shopper)).status).toBe(200);
    // 2 kits = 4 ropes + 2 balls.
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 10, reserved: 4 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 10, reserved: 2 });
    expect(await stockOf(kit.variantId)).toBeUndefined();

    const [order] = await db.select().from(orders);
    await db.transaction(async (tx) => {
      await cancelPendingOrder(tx, order!.id, { actor: 'test', note: 'test' });
    });
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
  });

  it('removes the components for good when the order is paid', async () => {
    const { res, rope, ball } = await makeKit();
    const kit = data<Bundle>(res);
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 1);
    await checkout(shopper);
    const [order] = await db.select().from(orders);
    await db.transaction(async (tx) => {
      const locked = await checkoutRepo.lockOrder(tx, order!.id);
      await applyTransition(tx, locked!, 'paid', { actor: 'test', fromProvider: true });
    });
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 8, reserved: 0 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 9, reserved: 0 });
  });

  it('merges a component that is also bought on its own into one reservation', async () => {
    const { res, rope } = await makeKit();
    const kit = data<Bundle>(res);
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 1);
    await shopper.addToCart(rope.variants[0]!.id, 3);
    expect((await checkout(shopper)).status).toBe(200);
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 10, reserved: 5 });
  });

  it('refuses at checkout when the components cannot cover the kit any more', async () => {
    const { res, rope } = await makeKit();
    const kit = data<Bundle>(res);
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 3);
    await db
      .update(inventory)
      .set({ quantity: 4 })
      .where(eq(inventory.variantId, rope.variants[0]!.id));
    expect((await checkout(shopper)).status).toBe(409);
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 4, reserved: 0 });
    expect(await db.select().from(bundleItems)).toHaveLength(2);
  });
});

describe('editing a kit after an order was placed', () => {
  const checkout = (shopper: Shopper) =>
    shopper.call('post', '/checkout', {
      email: 'ada@pawsome.test',
      shippingAddress: {
        fullName: 'Ada Lovelace',
        line1: '1 Bone Street',
        city: 'Riga',
        postalCode: 'LV-1010',
        country: 'LV',
      },
      shippingMethodCode: 'standard',
    });

  // Orders a kit (2 ropes + 1 ball), then the admin swaps the parts for 1 rope + 2 balls AND adds
  // a brand-new component the order never held.
  async function orderThenEditKit() {
    const { res, rope, ball } = await makeKit();
    const kit = data<Bundle>(res);
    const extra = await createProduct({ name: 'Bone', variants: [{ priceCents: 300, stock: 0 }] });
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 1);
    expect((await checkout(shopper)).status).toBe(200);
    const edit = await admin.call('patch', `/admin/bundles/${kit.variantId}`, {
      priceCents: 1900,
      components: [
        { variantId: rope.variants[0]!.id, qty: 1 },
        { variantId: ball.variants[0]!.id, qty: 2 },
        { variantId: extra.variants[0]!.id, qty: 1 },
      ],
    });
    expect(edit.status).toBe(200);
    const [order] = await db.select().from(orders);
    const transition = (to: 'paid' | 'cancelled' | 'refunded') =>
      db.transaction(async (tx) => {
        const locked = await checkoutRepo.lockOrder(tx, order!.id);
        await applyTransition(tx, locked!, to, { actor: 'test', fromProvider: true });
      });
    return { rope, ball, extra, transition };
  }

  it('releases what the order held, not what the kit is now', async () => {
    const { rope, ball, extra, transition } = await orderThenEditKit();
    await transition('cancelled');
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stockOf(extra.variants[0]!.id)).toEqual({ quantity: 0, reserved: 0 });
  });

  it('commits the original components when the payment arrives', async () => {
    const { rope, ball, extra, transition } = await orderThenEditKit();
    await transition('paid');
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 8, reserved: 0 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 9, reserved: 0 });
    expect(await stockOf(extra.variants[0]!.id)).toEqual({ quantity: 0, reserved: 0 });
  });

  it('restocks the original components on a refund', async () => {
    const { rope, ball, extra, transition } = await orderThenEditKit();
    await transition('paid');
    await transition('refunded');
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stockOf(extra.variants[0]!.id)).toEqual({ quantity: 0, reserved: 0 });
  });
});

describe('kits and shared components', () => {
  const checkout = (shopper: Shopper) =>
    shopper.call('post', '/checkout', {
      email: 'ada@pawsome.test',
      shippingAddress: {
        fullName: 'Ada Lovelace',
        line1: '1 Bone Street',
        city: 'Riga',
        postalCode: 'LV-1010',
        country: 'LV',
      },
      shippingMethodCode: 'standard',
    });

  it('checks stock per component across lines: a kit and its part on their own', async () => {
    // Kit = 2 ropes + 1 ball; 5 ropes in stock.
    const { res, rope } = await makeKit({ ropeStock: 5 });
    const kit = data<Bundle>(res);
    const ropeId = rope.variants[0]!.id;
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 1); // takes 2 ropes
    // 3 more ropes fit exactly, a 4th does not (checkout would refuse the merged demand).
    expect((await shopper.addToCart(ropeId, 4)).status).toBe(409);
    expect((await shopper.addToCart(ropeId, 3)).status).toBe(200);
    expect((await checkout(shopper)).status).toBe(200);
    expect(await stockOf(ropeId)).toEqual({ quantity: 5, reserved: 5 });
    // And the other way round: a second kit no longer fits next to 3 loose ropes.
    expect((await shopper.addToCart(kit.variantId, 1)).status).toBe(409);
  });

  it('clamps with a warning, not a checkout 409, when the part is short for the kit', async () => {
    const { res, rope } = await makeKit({ ropeStock: 5 });
    const kit = data<Bundle>(res);
    const ropeId = rope.variants[0]!.id;
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 1);
    await shopper.addToCart(ropeId, 3);
    // Stock drops to 3 ropes: kit (2) + loose ropes (3) = 5 > 3.
    await db.update(inventory).set({ quantity: 3 }).where(eq(inventory.variantId, ropeId));
    const cart = data<Cart>(await shopper.call('get', '/cart'));
    expect(cart.warnings.map((w) => w.code)).toContain('QTY_REDUCED');
    expect(cart.items.find((i) => i.variantId === ropeId)?.quantity).toBe(1);
    expect((await checkout(shopper)).status).toBe(200);
  });

  it('is sold out, and not purchasable, when a component is archived', async () => {
    const { res, rope } = await makeKit();
    const kit = data<Bundle>(res);
    const shopper = makeShopper(app);
    await shopper.addToCart(kit.variantId, 1);
    await db
      .update(productVariants)
      .set({ status: 'archived' })
      .where(eq(productVariants.id, rope.variants[0]!.id));
    const page = data<ProductDetail>(await makeShopper(app).call('get', '/products/play-kit'));
    expect(page.variants[0]?.available).toBe(false);
    expect((await makeShopper(app).addToCart(kit.variantId, 1)).status).toBe(409);
    const cart = data<Cart>(await shopper.call('get', '/cart'));
    expect(cart.warnings.map((w) => w.code)).toContain('OUT_OF_STOCK');
    expect(cart.subtotalCents).toBe(0);
    expect((await checkout(shopper)).status).toBe(409);
  });

  it('is sold out when the component product is archived', async () => {
    const { res, ball } = await makeKit();
    const kit = data<Bundle>(res);
    await db.update(products).set({ status: 'archived' }).where(eq(products.id, ball.product.id));
    expect((await makeShopper(app).addToCart(kit.variantId, 1)).status).toBe(409);
  });
});
