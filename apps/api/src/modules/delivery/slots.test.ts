import type { SlotsResponse } from '@store/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  carts,
  darkStores,
  deliverySlots,
  inventory,
  orders,
  slotHolds,
} from '../../db/schema/index.ts';
import { AREA_SEEDS, DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { forgetRun, runJob } from '../../jobs/runner.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { simulate } from '../../test/orders.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';
import { cancelOrderForTest } from '../../test/slots.ts';

import { generateSlots } from './slot-generation.ts';

let stripe: FakeStripe;
let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  stripe = new FakeStripe();
  app = makeTestApp({ payments: stripe });
  await createShippingMethods();
});

const MIN = 60_000;
const NEUKOELLN = AREA_SEEDS.find((a) => a.slug === 'neukoelln')!;

// A slot that starts `inMinutes` from now (so its cutoff is 60 minutes earlier than that).
async function makeSlot(
  opts: { inMinutes?: number; capacity?: number; storeId?: string } = {},
): Promise<string> {
  const startsAt = new Date(Date.now() + (opts.inMinutes ?? 180) * MIN);
  const [row] = await db
    .insert(deliverySlots)
    .values({
      storeId: opts.storeId ?? DEFAULT_STORE_ID,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * MIN),
      capacity: opts.capacity ?? 8,
    })
    .returning({ id: deliverySlots.id });
  return row!.id;
}

// A shopper with one item in the cart, on the Mitte postcode, who does NOT pick a slot by itself.
async function shopperWithCart(variantId: string, postcode = '10115'): Promise<Shopper> {
  const shopper = makeShopper(app, undefined, undefined, postcode, { autoSlot: false });
  const added = await shopper.addToCart(variantId, 1);
  expect(added.status).toBe(200);
  return shopper;
}

const variantOf = async (stock = 50) =>
  (await createProduct({ variants: [{ stock }] })).variants[0]!.id;

const body = (postalCode = '10115', shippingMethodCode = 'standard') => ({
  email: 'ada@grocery.test',
  shippingAddress: {
    fullName: 'Ada Lovelace',
    line1: '1 Bone Street',
    city: 'Berlin',
    postalCode,
    country: 'DE',
  },
  shippingMethodCode,
});

const holdsOf = (slotId: string) => db.select().from(slotHolds).where(eq(slotHolds.slotId, slotId));

describe('PUT /cart/slot', () => {
  it('holds a place for 15 minutes and shows it in the cart', async () => {
    const slot = await makeSlot();
    const shopper = await shopperWithCart(await variantOf());
    const before = Date.now();
    const res = await shopper.call('put', '/cart/slot', { slotId: slot });
    expect(res.status).toBe(200);
    const delivery = bodyOf<{ data: { delivery: Record<string, unknown> } }>(res).data.delivery;
    expect(delivery).toMatchObject({ kind: 'slot', slot: { id: slot } });
    const expires = new Date(delivery.holdExpiresAt as string).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 15 * MIN);
    expect(expires).toBeLessThanOrEqual(Date.now() + 15 * MIN);
    expect(await holdsOf(slot)).toHaveLength(1);
  });

  it('extends the hold when the same slot is put again and never counts the cart twice', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const shopper = await shopperWithCart(await variantOf());
    await shopper.call('put', '/cart/slot', { slotId: slot });
    await db
      .update(slotHolds)
      .set({ expiresAt: new Date(Date.now() + 2 * MIN) })
      .where(eq(slotHolds.slotId, slot));
    const again = await shopper.call('put', '/cart/slot', { slotId: slot });
    expect(again.status).toBe(200);
    const rows = await holdsOf(slot);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * MIN);
  });

  it('moves the one hold of a cart to another slot', async () => {
    const a = await makeSlot();
    const b = await makeSlot({ inMinutes: 240 });
    const shopper = await shopperWithCart(await variantOf());
    await shopper.call('put', '/cart/slot', { slotId: a });
    await shopper.call('put', '/cart/slot', { slotId: b });
    expect(await holdsOf(a)).toHaveLength(0);
    expect(await holdsOf(b)).toHaveLength(1);
  });

  it('refuses a full slot with 409 SLOT_FULL and lets a cart take it once a place is free', async () => {
    const slot = await makeSlot({ capacity: 2 });
    const variantId = await variantOf();
    const [one, two, three] = [
      await shopperWithCart(variantId),
      await shopperWithCart(variantId),
      await shopperWithCart(variantId),
    ];
    expect((await one.call('put', '/cart/slot', { slotId: slot })).status).toBe(200);
    expect((await two.call('put', '/cart/slot', { slotId: slot })).status).toBe(200);
    const refused = await three.call('put', '/cart/slot', { slotId: slot });
    expect(refused.status).toBe(409);
    expect(errorOf(refused).code).toBe('SLOT_FULL');
    // The first shopper lets go: the place is free at once.
    await one.call('delete', '/cart/slot');
    expect((await three.call('put', '/cart/slot', { slotId: slot })).status).toBe(200);
  });

  it('counts only live holds: an expired hold stops counting by itself, with no job run', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const variantId = await variantOf();
    const first = await shopperWithCart(variantId);
    const second = await shopperWithCart(variantId);
    await first.call('put', '/cart/slot', { slotId: slot });
    expect((await second.call('put', '/cart/slot', { slotId: slot })).status).toBe(409);
    await db
      .update(slotHolds)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(slotHolds.slotId, slot));
    // The row is still there (nothing deleted it), yet the place is free.
    expect(await holdsOf(slot)).toHaveLength(1);
    expect((await second.call('put', '/cart/slot', { slotId: slot })).status).toBe(200);
  });

  it('refuses a slot past its cutoff (60 minutes before the start) with 422 SLOT_CLOSED', async () => {
    const closed = await makeSlot({ inMinutes: 59 });
    const open = await makeSlot({ inMinutes: 61 });
    const shopper = await shopperWithCart(await variantOf());
    const refused = await shopper.call('put', '/cart/slot', { slotId: closed });
    expect(refused.status).toBe(422);
    expect(errorOf(refused).code).toBe('SLOT_CLOSED');
    expect((await shopper.call('put', '/cart/slot', { slotId: open })).status).toBe(200);
  });

  it("refuses another area's slot with 422 SLOT_WRONG_AREA", async () => {
    const slot = await makeSlot({ storeId: NEUKOELLN.storeId });
    const shopper = await shopperWithCart(await variantOf(), '10115'); // Mitte
    const refused = await shopper.call('put', '/cart/slot', { slotId: slot });
    expect(refused.status).toBe(422);
    expect(errorOf(refused).code).toBe('SLOT_WRONG_AREA');
  });

  it('answers 404 for an unknown slot and 400 for a malformed id', async () => {
    const shopper = await shopperWithCart(await variantOf());
    expect((await shopper.call('put', '/cart/slot', { slotId: crypto.randomUUID() })).status).toBe(
      404,
    );
    expect((await shopper.call('put', '/cart/slot', { slotId: 'nope' })).status).toBe(400);
  });

  it('frees a booked place when the order is cancelled, and counts paid orders as taken', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const variantId = await variantOf();
    const buyer = await shopperWithCart(variantId);
    await buyer.call('put', '/cart/slot', { slotId: slot });
    const placed = await buyer.call('post', '/checkout', body());
    expect(placed.status).toBe(200);
    const [order] = await db.select().from(orders);
    expect(order).toMatchObject({ slotId: slot, deliveryKind: 'slot' });

    const other = await shopperWithCart(variantId);
    const full = await other.call('put', '/cart/slot', { slotId: slot });
    expect(errorOf(full).code).toBe('SLOT_FULL');

    await cancelOrderForTest(order!.id);
    expect((await other.call('put', '/cart/slot', { slotId: slot })).status).toBe(200);
  });
});

describe('DELETE /cart/slot', () => {
  it('drops the hold and the cart shows no delivery', async () => {
    const slot = await makeSlot();
    const shopper = await shopperWithCart(await variantOf());
    await shopper.call('put', '/cart/slot', { slotId: slot });
    const res = await shopper.call('delete', '/cart/slot');
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { delivery: unknown } }>(res).data.delivery).toBeNull();
    expect(await holdsOf(slot)).toHaveLength(0);
  });
});

describe('GET /delivery/slots', () => {
  it('lists days with open, full and closed slots and the places left, for the postcode store', async () => {
    await generateSlots(db, new Date());
    const full = await makeSlot({ inMinutes: 300, capacity: 1 });
    const variantId = await variantOf();
    const shopper = await shopperWithCart(variantId);
    await shopper.call('put', '/cart/slot', { slotId: full });
    const closedSlot = await makeSlot({ inMinutes: 20 });

    const res = await shopper.call('get', '/delivery/slots');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    // Public and cart-free: looking at the slots creates no guest cart and sets no cookie.
    const fresh = await makeShopper(app, undefined, undefined, '10115').call(
      'get',
      '/delivery/slots',
    );
    expect(fresh.headers['set-cookie']).toBeUndefined();
    const data = bodyOf<SlotsResponse>(res).data;
    const all = data.days.flatMap((d) => d.slots);
    expect(all.find((s) => s.id === full)).toMatchObject({ status: 'full', remaining: 0 });
    expect(all.find((s) => s.id === closedSlot)).toMatchObject({ status: 'closed' });
    expect(all.some((s) => s.status === 'open' && s.remaining === 8)).toBe(true);
    // Mitte only: one store's slots, in order, grouped by day.
    const ids = new Set(
      (
        await db.select().from(deliverySlots).where(eq(deliverySlots.storeId, DEFAULT_STORE_ID))
      ).map((r) => r.id),
    );
    expect(all.every((s) => ids.has(s.id))).toBe(true);
    const starts = all.map((s) => Date.parse(s.startsAt));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(data.days.map((d) => d.date)).size).toBe(data.days.length);
  });

  it('reads the store of the X-Postcode header', async () => {
    await generateSlots(db, new Date());
    const neukoelln = makeShopper(app, undefined, undefined, '12045');
    const res = await neukoelln.call('get', '/delivery/slots');
    const ids = new Set(
      (
        await db.select().from(deliverySlots).where(eq(deliverySlots.storeId, NEUKOELLN.storeId))
      ).map((r) => r.id),
    );
    const all = bodyOf<SlotsResponse>(res).data.days.flatMap((d) => d.slots);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((s) => ids.has(s.id))).toBe(true);
  });
});

describe('express delivery', () => {
  const setHours = (opensAt: string, closesAt: string, expressRiders = 2) =>
    db
      .update(darkStores)
      .set({ opensAt, closesAt, expressRiders })
      .where(eq(darkStores.id, DEFAULT_STORE_ID));
  const expressOf = async (shopper: Shopper) =>
    bodyOf<SlotsResponse>(await shopper.call('get', '/delivery/slots')).data.express;

  it('is available while the store is open, closed outside the hours, and needs a postcode', async () => {
    await setHours('00:00', '24:00');
    const variantId = await variantOf();
    const shopper = await shopperWithCart(variantId);
    expect(await expressOf(shopper)).toEqual({ available: true });
    await setHours('03:00', '03:01');
    expect(await expressOf(shopper)).toEqual({ available: false, reason: 'closed' });
    const noPostcode = makeShopper(app);
    expect(await expressOf(noPostcode)).toEqual({ available: false, reason: 'no_postcode' });
  });

  it('is busy once the riders of the last 30 minutes are used, and frees up when one order is cancelled', async () => {
    await setHours('00:00', '24:00', 1);
    const variantId = await variantOf();
    const one = await shopperWithCart(variantId);
    const two = await shopperWithCart(variantId);
    expect((await one.call('put', '/cart/express')).status).toBe(200);
    const placed = await one.call('post', '/checkout', body('10115', 'express'));
    expect(placed.status).toBe(200);
    const [order] = await db.select().from(orders);
    expect(order).toMatchObject({ deliveryKind: 'express', slotId: null });
    expect(order!.deliveryTo!.getTime() - order!.deliveryFrom!.getTime()).toBe(30 * MIN);

    const busy = await two.call('put', '/cart/express');
    expect(busy.status).toBe(409);
    expect(errorOf(busy)).toMatchObject({ code: 'EXPRESS_UNAVAILABLE' });
    expect(await expressOf(two)).toEqual({ available: false, reason: 'busy' });

    await cancelOrderForTest(order!.id);
    expect((await two.call('put', '/cart/express')).status).toBe(200);
  });

  it('refuses express without a postcode and the cheap method for an express order', async () => {
    await setHours('00:00', '24:00');
    const variantId = await variantOf();
    const shopper = await shopperWithCart(variantId);
    expect((await shopper.call('put', '/cart/express')).status).toBe(200);
    const wrong = await shopper.call('post', '/checkout', body('10115', 'standard'));
    expect(wrong.status).toBe(400);
    const anon = makeShopper(app);
    await anon.addToCart(variantId, 1);
    const refused = await anon.call('put', '/cart/express');
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ reason: 'no_postcode' });
  });

  it('switching to a slot drops express, and picking express drops the hold', async () => {
    await setHours('00:00', '24:00');
    const slot = await makeSlot();
    const shopper = await shopperWithCart(await variantOf());
    await shopper.call('put', '/cart/slot', { slotId: slot });
    await shopper.call('put', '/cart/express');
    expect(await holdsOf(slot)).toHaveLength(0);
    const [cart] = await db.select().from(carts);
    expect(cart!.express).toBe(true);
    await shopper.call('put', '/cart/slot', { slotId: slot });
    expect((await db.select().from(carts))[0]!.express).toBe(false);
  });
});

describe('checkout and the slot', () => {
  it('turns the hold into the order slot, with the window, in the same transaction as the stock', async () => {
    const slot = await makeSlot();
    const variantId = await variantOf(10);
    const shopper = await shopperWithCart(variantId);
    await shopper.call('put', '/cart/slot', { slotId: slot });
    const res = await shopper.call('post', '/checkout', body());
    expect(res.status).toBe(200);
    const [order] = await db.select().from(orders);
    const [row] = await db.select().from(deliverySlots).where(eq(deliverySlots.id, slot));
    expect(order).toMatchObject({
      deliveryKind: 'slot',
      slotId: slot,
      darkStoreId: DEFAULT_STORE_ID,
    });
    expect(order!.deliveryFrom).toEqual(row!.startsAt);
    expect(order!.deliveryTo).toEqual(row!.endsAt);
    expect(await holdsOf(slot)).toHaveLength(0);
    const [stock] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
    expect(stock!.reserved).toBeGreaterThan(0);
  });

  it('needs a delivery time: 422 DELIVERY_REQUIRED, and nothing is reserved', async () => {
    const variantId = await variantOf(10);
    const shopper = await shopperWithCart(variantId);
    const res = await shopper.call('post', '/checkout', body());
    expect(res.status).toBe(422);
    expect(errorOf(res).code).toBe('DELIVERY_REQUIRED');
    expect(await db.select().from(orders)).toHaveLength(0);
    const [stock] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
    expect(stock!.reserved).toBe(0);
  });

  it('refuses an expired hold with 409 SLOT_HOLD_EXPIRED', async () => {
    const slot = await makeSlot();
    const shopper = await shopperWithCart(await variantOf(10));
    await shopper.call('put', '/cart/slot', { slotId: slot });
    await db
      .update(slotHolds)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(slotHolds.slotId, slot));
    const res = await shopper.call('post', '/checkout', body());
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('SLOT_HOLD_EXPIRED');
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("refuses an address in another store's area with 422 SLOT_WRONG_AREA", async () => {
    const slot = await makeSlot(); // Mitte
    const shopper = await shopperWithCart(await variantOf(10), '10115');
    await shopper.call('put', '/cart/slot', { slotId: slot });
    const res = await shopper.call('post', '/checkout', body(NEUKOELLN.postcodes[1]));
    expect(res.status).toBe(422);
    expect(errorOf(res).code).toBe('SLOT_WRONG_AREA');
    // The hold survived the refusal: the shopper can fix the address.
    expect(await holdsOf(slot)).toHaveLength(1);
  });

  it('keeps the slot for a retried payment (the hold was used by the first attempt)', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const variantId = await variantOf(10);
    const shopper = await shopperWithCart(variantId);
    await shopper.call('put', '/cart/slot', { slotId: slot });
    expect((await shopper.call('post', '/checkout', body())).status).toBe(200);
    expect((await shopper.call('post', '/checkout', body())).status).toBe(200);
    const all = await db.select().from(orders);
    expect(all.filter((o) => o.status === 'pending_payment')).toHaveLength(1);
    expect(all.filter((o) => o.slotId === slot && o.status !== 'cancelled')).toHaveLength(1);
  });

  it('gives the slot back after a payment provider failure, so pay can be pressed again', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const shopper = await shopperWithCart(await variantOf(10));
    await shopper.call('put', '/cart/slot', { slotId: slot });
    stripe.failNext('create');
    expect((await shopper.call('post', '/checkout', body())).status).toBe(502);
    expect(await holdsOf(slot)).toHaveLength(1);
    expect((await shopper.call('post', '/checkout', body())).status).toBe(200);
  });

  it('frees the place when a payment is cancelled (webhook) and counts it again while pending', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const variantId = await variantOf(10);
    const buyer = await shopperWithCart(variantId);
    await buyer.call('put', '/cart/slot', { slotId: slot });
    await buyer.call('post', '/checkout', body());
    const [order] = await db.select().from(orders);
    const other = await shopperWithCart(variantId);
    expect(errorOf(await other.call('put', '/cart/slot', { slotId: slot })).code).toBe('SLOT_FULL');
    await simulate(app, order!.number, 'payment_intent.canceled');
    expect((await other.call('put', '/cart/slot', { slotId: slot })).status).toBe(200);
  });
});

describe('two carts racing for the last place', () => {
  it('lets exactly one win, however many try at once', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const variantId = await variantOf();
    const shoppers: Shopper[] = [];
    for (let i = 0; i < 6; i++) shoppers.push(await shopperWithCart(variantId));
    const results = await Promise.all(
      shoppers.map((s) => s.call('put', '/cart/slot', { slotId: slot })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const lost = results.filter((r) => r.status !== 200);
    expect(lost).toHaveLength(5);
    expect(lost.every((r) => errorOf(r).code === 'SLOT_FULL')).toBe(true);
    expect(await holdsOf(slot)).toHaveLength(1);
  });

  it('holds a capacity of 3 against 8 racers: exactly 3 win', async () => {
    const slot = await makeSlot({ capacity: 3 });
    const variantId = await variantOf();
    const shoppers: Shopper[] = [];
    for (let i = 0; i < 8; i++) shoppers.push(await shopperWithCart(variantId));
    const results = await Promise.all(
      shoppers.map((s) => s.call('put', '/cart/slot', { slotId: slot })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(await holdsOf(slot)).toHaveLength(3);
  });

  it('serialises a hold against an order placed at the same moment for the last place', async () => {
    const slot = await makeSlot({ capacity: 2 });
    const variantId = await variantOf();
    const buyer = await shopperWithCart(variantId);
    await buyer.call('put', '/cart/slot', { slotId: slot });
    const racers: Shopper[] = [];
    for (let i = 0; i < 4; i++) racers.push(await shopperWithCart(variantId));
    // The buyer's hold becomes an order while four others try for the one remaining place.
    const [checkout, ...puts] = await Promise.all([
      buyer.call('post', '/checkout', body()),
      ...racers.map((s) => s.call('put', '/cart/slot', { slotId: slot })),
    ]);
    expect(checkout.status).toBe(200);
    expect(puts.filter((r) => r.status === 200)).toHaveLength(1);
    const holds = await holdsOf(slot);
    const booked = (await db.select().from(orders)).filter((o) => o.slotId === slot);
    expect(holds.length + booked.length).toBe(2);
  });
});

describe('release-slot-holds', () => {
  const ctx = (now: Date) => ({ now, log: { error() {} } as never, gateway: {} as never });

  it('deletes holds that expired over an hour ago and nothing else', async () => {
    const slot = await makeSlot({ capacity: 5 });
    const variantId = await variantOf();
    const [old, recent, live] = [
      await shopperWithCart(variantId),
      await shopperWithCart(variantId),
      await shopperWithCart(variantId),
    ];
    for (const s of [old, recent, live]) await s.call('put', '/cart/slot', { slotId: slot });
    const rows = await holdsOf(slot);
    expect(rows).toHaveLength(3);
    const [a, b] = rows;
    await db
      .update(slotHolds)
      .set({ expiresAt: new Date(Date.now() - 2 * 3_600_000) })
      .where(eq(slotHolds.id, a!.id));
    await db
      .update(slotHolds)
      .set({ expiresAt: new Date(Date.now() - 10 * MIN) })
      .where(eq(slotHolds.id, b!.id));

    const now = new Date();
    const out = await runJob('release-slot-holds', ctx(now));
    expect(out).toMatchObject({ status: 'ran', result: { deleted: 1 } });
    expect(await holdsOf(slot)).toHaveLength(2);
    // Every 5 minutes: a second call in the same period is skipped, the next period runs again.
    expect((await runJob('release-slot-holds', ctx(now))).status).toBe('skipped');
    expect(
      (await runJob('release-slot-holds', ctx(new Date(now.getTime() + 5 * MIN)))).status,
    ).toBe('ran');
    await forgetRun('release-slot-holds', now);
  });

  it('is housekeeping: with the job never run, an expired hold still frees its place', async () => {
    const slot = await makeSlot({ capacity: 1 });
    const variantId = await variantOf();
    const a = await shopperWithCart(variantId);
    const b = await shopperWithCart(variantId);
    await a.call('put', '/cart/slot', { slotId: slot });
    await db
      .update(slotHolds)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(slotHolds.slotId, slot));
    expect((await b.call('put', '/cart/slot', { slotId: slot })).status).toBe(200);
  });
});
