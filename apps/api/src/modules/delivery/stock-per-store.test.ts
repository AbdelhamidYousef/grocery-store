import { and, eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { inventory, inventoryAdjustments, orders, stockAlerts } from '../../db/schema/index.ts';
import { AREA_SEEDS, DEFAULT_STORE_ID, storeIdBySlug } from '../../db/seed/delivery.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods, stockAt } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn, simulate, stockOf, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { createOutbox } from '../mail/outbox.ts';
import { sendDueAlerts } from '../stock-alerts/service.ts';

let stripe: FakeStripe;
let app: ReturnType<typeof makeTestApp>;
let transport: MemoryTransport;
beforeEach(async () => {
  stripe = new FakeStripe();
  transport = new MemoryTransport();
  app = makeTestApp({
    payments: stripe,
    outbox: createOutbox({ transport, log: pino({ level: 'silent' }) }),
  });
  await createShippingMethods();
});

const NEUKOELLN = storeIdBySlug('neukoelln')!;
const MITTE = DEFAULT_STORE_ID;

// Out of stock in Mitte, 7 in Neukölln, 3 in Kreuzberg-Friedrichshain.
async function yoghurt() {
  const { variants, product } = await createProduct({ variants: [{ priceCents: 500, stock: 0 }] });
  const variantId = variants[0]!.id;
  await stockAt(variantId, 'neukoelln', 7);
  await stockAt(variantId, 'kreuzberg-friedrichshain', 3);
  return { variantId, slug: product.slug };
}

const detail = async (slug: string, postcode?: string) => {
  const res = await makeShopper(app, undefined, undefined, postcode).call(
    'get',
    `/products/${slug}`,
  );
  return bodyOf<{
    data: { inStock: boolean; variants: { available: boolean; lowStock: boolean }[] };
  }>(res).data;
};

describe('availability follows the shopper postcode', () => {
  it('shows the product sold out in Mitte and in stock in Neukölln', async () => {
    const { slug } = await yoghurt();
    expect((await detail(slug)).inStock).toBe(false); // no postcode: the default store, Mitte
    expect((await detail(slug, '10115')).inStock).toBe(false); // a Mitte postcode
    expect((await detail(slug, '12045')).inStock).toBe(true); // Neukölln
    expect((await detail(slug, '10997')).variants[0]).toMatchObject({
      available: true,
      lowStock: true, // 3 left, at the default threshold of 5
    });
  });

  it('browses Mitte for an unserved or malformed postcode instead of failing', async () => {
    const { slug } = await yoghurt();
    expect((await detail(slug, '80331')).inStock).toBe(false);
    expect((await detail(slug, 'junk')).inStock).toBe(false);
  });

  it('caps the cart at the units of the store being browsed', async () => {
    const { variantId } = await yoghurt();
    const mitte = makeShopper(app);
    expect((await mitte.addToCart(variantId, 1)).status).toBe(409);
    const neukoelln = makeShopper(app, undefined, undefined, '12045');
    expect((await neukoelln.addToCart(variantId, 7)).status).toBe(200);
    expect((await neukoelln.addToCart(variantId, 1)).status).toBeGreaterThanOrEqual(400);
  });

  it('filters the listing by in-stock per store', async () => {
    const { slug } = await yoghurt();
    const list = async (postcode?: string) => {
      const res = await makeShopper(app, undefined, undefined, postcode).call(
        'get',
        '/products?inStock=true',
      );
      return bodyOf<{ data: { slug: string }[] }>(res).data.map((p) => p.slug);
    };
    expect(await list()).not.toContain(slug);
    expect(await list('12043')).toContain(slug);
  });
});

describe('checkout reserves at the store of the delivery address', () => {
  const buy = async (
    postalCode: string,
    variantId: string,
    quantity = 2,
    headerPostcode?: string,
  ) => {
    const shopper = makeShopper(app, undefined, undefined, headerPostcode);
    expect((await shopper.addToCart(variantId, quantity)).status).toBe(200);
    const res = await shopper.call('post', '/checkout', {
      email: 'ada@grocery.test',
      shippingAddress: { ...TEST_ADDRESS, postalCode },
      shippingMethodCode: 'standard',
    });
    return { shopper, res };
  };

  it('holds the units in the address store and leaves the others alone', async () => {
    const { variantId } = await yoghurt();
    // Browsing Neukölln, delivering to Neukölln.
    const { res } = await buy('12045', variantId, 2, '12045');
    expect(res.status).toBe(200);
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 2 });
    expect(await stockOf(variantId, MITTE)).toEqual({ quantity: 0, reserved: 0 });
    const [order] = await db.select().from(orders);
    expect(order?.darkStoreId).toBe(NEUKOELLN);
  });

  it('uses the address, not the header: browsing Mitte but delivering to Neukölln', async () => {
    const { variantId } = await yoghurt();
    // The cart is filled while browsing Neukölln (a cart cannot hold what the store lacks), then the
    // header is gone/changed at checkout: only the address counts.
    const shopper = makeShopper(app, undefined, undefined, '12045');
    await shopper.addToCart(variantId, 3);
    const viaMitteHeader = makeShopper(app, undefined, undefined, '10115');
    viaMitteHeader.jar.set('cart_id', shopper.jar.get('cart_id')!);
    const res = await viaMitteHeader.call('post', '/checkout', {
      email: 'ada@grocery.test',
      shippingAddress: { ...TEST_ADDRESS, postalCode: '12045' },
      shippingMethodCode: 'standard',
    });
    expect(res.status).toBe(200);
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 3 });
    expect(await stockOf(variantId, MITTE)).toEqual({ quantity: 0, reserved: 0 });
  });

  it('refuses an unserved postcode with 422 POSTCODE_NOT_SERVED naming the areas we cover', async () => {
    const { variantId } = await yoghurt();
    const { res } = await buy('80331', variantId, 1, '12045');
    expect(res.status).toBe(422);
    expect(errorOf(res)).toMatchObject({ code: 'POSTCODE_NOT_SERVED' });
    expect(errorOf(res).message).toContain("We don't deliver to 80331 yet");
    for (const area of AREA_SEEDS) expect(errorOf(res).message).toContain(area.name);
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 0 });
  });

  it('refuses a postcode that is not even a postcode (the old Latvian one)', async () => {
    const { variantId } = await yoghurt();
    const { res } = await buy('LV-1010', variantId, 1, '12045');
    expect(res.status).toBe(422);
  });

  it('refuses when the address store has none of it, although another store does', async () => {
    const { variantId } = await yoghurt();
    // The cart is filled in Neukölln, but the bag would be packed in Mitte, which has none.
    const shopper = makeShopper(app, undefined, undefined, '12045');
    await shopper.addToCart(variantId, 1);
    const res = await shopper.call('post', '/checkout', {
      email: 'ada@grocery.test',
      shippingAddress: { ...TEST_ADDRESS, postalCode: '10115' },
      shippingMethodCode: 'standard',
    });
    expect(res.status).toBe(409);
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 0 });
    expect(await stockOf(variantId, MITTE)).toEqual({ quantity: 0, reserved: 0 });
  });

  it('moves the reservation when a retried payment changes the address to another store', async () => {
    const { variantId } = await yoghurt();
    const { shopper } = await buy('12045', variantId, 2, '12045');
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 2 });
    const res = await shopper.call('post', '/checkout', {
      email: 'ada@grocery.test',
      shippingAddress: { ...TEST_ADDRESS, postalCode: '10997' },
      shippingMethodCode: 'standard',
    });
    expect(res.status).toBe(200);
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 0 });
    expect(await stockOf(variantId, storeIdBySlug('kreuzberg-friedrichshain'))).toEqual({
      quantity: 3,
      reserved: 2,
    });
  });

  it('commits a paid order, and restocks a cancelled paid order, in its own store', async () => {
    const { variantId } = await yoghurt();
    const { res } = await buy('12045', variantId, 2, '12045');
    const orderNumber = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
    await simulate(app, orderNumber, 'payment_intent.succeeded');
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 5, reserved: 0 });
    expect(await stockOf(variantId, MITTE)).toEqual({ quantity: 0, reserved: 0 });

    const admin = await signedIn(app, 'admin');
    const cancel = await admin.shopper.call('post', `/admin/orders/${orderNumber}/transition`, {
      to: 'cancelled',
    });
    expect(cancel.status).toBeLessThan(300);
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 0 });
    expect(await stockOf(variantId, MITTE)).toEqual({ quantity: 0, reserved: 0 });
  });

  it('gives the reservation back to the order store when the payment is cancelled', async () => {
    const { variantId } = await yoghurt();
    const { res } = await buy('12045', variantId, 2, '12045');
    const orderNumber = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
    await simulate(app, orderNumber, 'payment_intent.canceled');
    expect(await stockOf(variantId, NEUKOELLN)).toEqual({ quantity: 7, reserved: 0 });
  });
});

describe('admin stock per store', () => {
  it('lists one row per store on the variant and totals them', async () => {
    const { variantId } = await yoghurt();
    const admin = await signedIn(app, 'admin');
    const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
    expect(row).toBeDefined();
    const productId = (
      await db.query.productVariants.findFirst({ where: (v, { eq: is }) => is(v.id, variantId) })
    )?.productId;
    const res = await admin.shopper.call('get', `/admin/products/${productId}`);
    const variant = bodyOf<{
      data: {
        variants: {
          quantity: number;
          available: number;
          stores: { storeSlug: string; quantity: number; reserved: number }[];
        }[];
      };
    }>(res).data.variants[0]!;
    expect(variant.stores.map((s) => [s.storeSlug, s.quantity])).toEqual(
      expect.arrayContaining([
        ['mitte', 0],
        ['neukoelln', 7],
        ['kreuzberg-friedrichshain', 3],
      ]),
    );
    expect(variant.quantity).toBe(10);
    expect(variant.available).toBe(10);
  });

  it('counts one store without touching the others, and records the store on the adjustment', async () => {
    const { variantId } = await yoghurt();
    const admin = await signedIn(app, 'admin');
    const res = await admin.shopper.call('patch', `/admin/inventory/${variantId}`, {
      storeId: NEUKOELLN,
      quantity: 20,
      reason: 'restock',
      lowStockThreshold: 12,
    });
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: object }>(res).data).toMatchObject({
      variantId,
      storeId: NEUKOELLN,
      quantity: 20,
      available: 20,
      delta: 13,
    });
    const [adj] = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.variantId, variantId));
    expect(adj).toMatchObject({ storeId: NEUKOELLN, delta: 13 });
    expect(await stockOf(variantId, MITTE)).toEqual({ quantity: 0, reserved: 0 });
    const [row] = await db
      .select()
      .from(inventory)
      .where(and(eq(inventory.variantId, variantId), eq(inventory.storeId, NEUKOELLN)));
    expect(row?.lowStockThreshold).toBe(12);
  });

  it('defaults to the central store and 404s a store that has no shelf of the variant', async () => {
    const { variantId } = await yoghurt();
    const admin = await signedIn(app, 'admin');
    const res = await admin.shopper.call('patch', `/admin/inventory/${variantId}`, {
      quantity: 4,
      reason: 'correction',
    });
    expect(bodyOf<{ data: { storeId: string } }>(res).data.storeId).toBe(MITTE);
    const gone = await admin.shopper.call('patch', `/admin/inventory/${variantId}`, {
      storeId: '00000000-0000-4000-8000-0000000000ff',
      quantity: 4,
      reason: 'correction',
    });
    expect(gone.status).toBe(404);
  });

  it('refuses to delete a variant reserved in any store', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 5 }, { stock: 5 }] });
    await stockAt(variants[1]!.id, 'neukoelln', 5, 2);
    const admin = await signedIn(app, 'admin');
    const res = await admin.shopper.call('delete', `/admin/variants/${variants[1]!.id}`);
    expect(res.status).toBe(409);
  });

  it('reports low stock per store on the dashboard', async () => {
    const { variantId } = await yoghurt(); // Mitte 0 (low), Kreuzberg 3 (low), Neukölln 7 (fine)
    const admin = await signedIn(app, 'admin');
    const res = await admin.shopper.call('get', '/admin/stats');
    const stats = bodyOf<{
      data: { lowStockCount: number; lowStockByStore: { storeSlug: string; count: number }[] };
    }>(res).data;
    const by = Object.fromEntries(stats.lowStockByStore.map((s) => [s.storeSlug, s.count]));
    expect(by).toMatchObject({ mitte: 1, 'kreuzberg-friedrichshain': 1, neukoelln: 0 });
    expect(stats.lowStockByStore).toHaveLength(4);
    expect(stats.lowStockCount).toBe(2 + (by['prenzlauer-berg'] ?? 0));
    expect(variantId).toBeTruthy();
  });
});

describe('back-in-stock alerts per store', () => {
  const log = pino({ level: 'silent' });

  it('stores the store the shopper was browsing and wakes only on that store restock', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 0 }] });
    const variantId = variants[0]!.id;
    await stockAt(variantId, 'neukoelln', 0);
    const shopper = makeShopper(app, undefined, undefined, '12045');
    const ask = await shopper.call('post', '/stock-alerts', {
      variantId,
      email: 'pat@example.com',
    });
    expect(ask.status).toBeLessThan(300);
    expect((await db.select().from(stockAlerts))[0]?.storeId).toBe(NEUKOELLN);

    await stockAt(variantId, 'mitte', 9); // another store restocks: not the one waited on
    expect((await db.select().from(stockAlerts))[0]?.dueAt).toBeNull();

    await stockAt(variantId, 'neukoelln', 4);
    expect((await db.select().from(stockAlerts))[0]?.dueAt).toBeInstanceOf(Date);
    const outbox = createOutbox({ transport, log });
    expect(await sendDueAlerts({ outbox, log })).toEqual({ sent: 1, deferred: 0 });
  });

  it('refuses an alert on something that is in stock at the browsed store, not elsewhere', async () => {
    const { variantId } = await yoghurt();
    const inNeukoelln = makeShopper(app, undefined, undefined, '12045');
    expect(
      (await inNeukoelln.call('post', '/stock-alerts', { variantId, email: 'a@b.test' })).status,
    ).toBe(409);
    const inMitte = makeShopper(app);
    expect(
      (await inMitte.call('post', '/stock-alerts', { variantId, email: 'a@b.test' })).status,
    ).toBeLessThan(300);
  });

  it('holds an alert whose store is still empty although another store has stock', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 0 }] });
    const variantId = variants[0]!.id;
    const shopper = makeShopper(app);
    await shopper.call('post', '/stock-alerts', { variantId, email: 'pat@example.com' });
    // Force the alert due (as the trigger would after a Mitte restock), then restock elsewhere only.
    await stockAt(variantId, 'neukoelln', 8);
    await db.update(stockAlerts).set({ dueAt: new Date() });
    const outbox = createOutbox({ transport, log });
    expect(await sendDueAlerts({ outbox, log })).toEqual({ sent: 0, deferred: 1 });
  });
});
