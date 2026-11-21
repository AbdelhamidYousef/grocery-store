import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import { db } from '../../db/client.ts';
import {
  inventory,
  inventoryAdjustments,
  orderItems,
  orders,
  payments,
  returns,
} from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import {
  TEST_ADDRESS,
  deliveredOrder,
  markDelivered,
  orderByNumber,
  signedIn,
  simulate,
  stockOf,
} from '../../test/orders.ts';
import type { Shopper } from '../../test/shopper.ts';
import { expectBatchInvariant } from '../../test/stock.ts';
import { createOutbox } from '../mail/outbox.ts';
import { onOrderRefunded } from '../orders/events.ts';
import type { OrderRefundedEvent } from '../orders/events.ts';

const fake = new FakeStripe();
const transport = new MemoryTransport();
const outbox = createOutbox({ transport, log: pino({ level: 'silent' }) });
const app = makeTestApp({ payments: fake, outbox });

// One subscriber for the whole file (the registry is a Set of functions, so registering twice is
// a no-op): it records every refund event so tests can assert exactly what phase 19 will receive.
const events: OrderRefundedEvent[] = [];
onOrderRefunded((_tx, e) => {
  events.push(e);
  return Promise.resolve();
});

let admin: Shopper;
beforeEach(async () => {
  admin = (await signedIn(app, 'admin', 'boss@grocery.test')).shopper;
  await createShippingMethods();
  transport.sent.length = 0;
  events.length = 0;
  fake.calls.length = 0;
});

interface Detail {
  data: {
    return: {
      id: string;
      status: string;
      refundCents: number;
      simulated: boolean;
      items: { id: string; orderItemId: string; reason: string; refundCents: number }[];
    };
    allowedNext: string[];
    shippingRefundable: boolean;
    restockItemIds: string[];
    simulatedMode: boolean;
  };
}

type Delivered = Awaited<ReturnType<typeof deliveredOrder>>;

async function lines(number: string) {
  const order = await orderByNumber(number);
  return db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
}

async function requestReturn(
  o: Delivered,
  items: { orderItemId: string; quantity: number; reason?: string }[],
  reason = 'wrong_size',
) {
  const res = await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, { reason, items });
  expect(res.status).toBe(201);
  return bodyOf<{ data: { id: string } }>(res).data.id;
}

const act = (id: string, action: string, body: object = {}) =>
  admin.call('post', `/admin/returns/${id}/${action}`, body);
const detail = async (id: string) =>
  bodyOf<Detail>(await admin.call('get', `/admin/returns/${id}`)).data;
const intentOf = async (number: string) =>
  (
    await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, (await orderByNumber(number)).id))
  )[0]!.providerPaymentIntentId!;

// Whatever a test did to stock, the batches still add up to every stock row.
afterEach(expectBatchInvariant);

describe('admin returns: guard and listing', () => {
  it('needs an admin and lists returns newest first with a status filter', async () => {
    const o = await deliveredOrder(app, { quantity: 2 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    expect((await o.buyer.shopper.call('get', '/admin/returns')).status).toBe(403);
    const all = bodyOf<{
      data: { id: string; itemCount: number; email: string }[];
      meta: { total: number };
    }>(await admin.call('get', '/admin/returns'));
    expect(all.meta.total).toBe(1);
    expect(all.data[0]).toMatchObject({ id, itemCount: 1, email: o.buyer.user.email });
    const none = bodyOf<{ data: unknown[] }>(
      await admin.call('get', '/admin/returns?status=approved'),
    );
    expect(none.data).toEqual([]);
    expect((await admin.call('get', `/admin/returns/${id}`)).status).toBe(200);
  });

  it('only offers the next state and refuses the rest with 409', async () => {
    const o = await deliveredOrder(app);
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    expect((await detail(id)).allowedNext).toEqual(['approved', 'rejected']);
    for (const action of ['receive', 'refund']) {
      const res = await act(id, action);
      expect(res.status).toBe(409);
      expect(errorOf(res).message).toMatch(/cannot move/);
    }
    expect((await act(id, 'reject', { reason: 'no' })).status).toBe(400);
    expect((await act(id, 'reject', { reason: 'Used and dirty' })).status).toBe(200);
    expect((await act(id, 'approve')).status).toBe(409);
  });
});

describe('admin returns: full flow', () => {
  it('approve -> receive restocks -> refund moves the exact cents and the order becomes refunded', async () => {
    const o = await deliveredOrder(app, { quantity: 2, priceCents: 1500, stock: 10 });
    const [line] = await lines(o.number);
    // Paid: stock went 10 -> 8.
    expect(await stockOf(o.variantId)).toEqual({ quantity: 8, reserved: 0 });
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 2 }]);

    await act(id, 'approve');
    expect(await stockOf(o.variantId)).toEqual({ quantity: 8, reserved: 0 }); // not yet
    expect((await detail(id)).allowedNext).toEqual(['received']);

    const received = await act(id, 'receive');
    expect(received.status).toBe(200);
    expect(await stockOf(o.variantId)).toEqual({ quantity: 10, reserved: 0 });
    const adj = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.variantId, o.variantId));
    expect(adj).toMatchObject([{ delta: 2, reason: 'return', actor: 'admin:boss@grocery.test' }]);

    const refunded = bodyOf<Detail>(await act(id, 'refund'));
    expect(refunded.data.return).toMatchObject({
      status: 'refunded',
      refundCents: 3000,
      simulated: false,
    });
    expect(fake.refundedCents(await intentOf(o.number))).toBe(3000);
    expect((await orderByNumber(o.number)).status).toBe('refunded');
    await expectBatchInvariant();
    // Not restocked a second time by the order's own refunded transition.
    expect(await stockOf(o.variantId)).toEqual({ quantity: 10, reserved: 0 });
  });

  it('a partial return leaves the order delivered and refunds only that line share', async () => {
    const o = await deliveredOrder(app, { quantity: 3, priceCents: 1000 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    await act(id, 'approve');
    await act(id, 'receive');
    await act(id, 'refund');
    expect((await orderByNumber(o.number)).status).toBe('delivered');
    expect(fake.refundedCents(await intentOf(o.number))).toBe(1000);
    // The order keeps a running total of what was handed back (analytics reads revenue net of it).
    expect((await orderByNumber(o.number)).refundedCents).toBe(1000);
    // A second return for the rest finishes the order.
    const id2 = await requestReturn(o, [{ orderItemId: line!.id, quantity: 2 }]);
    await act(id2, 'approve');
    await act(id2, 'receive');
    await act(id2, 'refund');
    expect((await orderByNumber(o.number)).status).toBe('refunded');
    expect((await orderByNumber(o.number)).refundedCents).toBe(3000);
    expect(fake.refundedCents(await intentOf(o.number))).toBe(3000);
  });

  it('skips damaged lines on receive, restocks chosen lines only, and refuses restocking a damaged one', async () => {
    const o = await deliveredOrder(app, { quantity: 4, stock: 10 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 2, reason: 'damaged' }]);
    await act(id, 'approve');
    const asked = await act(id, 'receive', {
      restockItemIds: [(await detail(id)).return.items[0]!.id],
    });
    expect(asked.status).toBe(422);
    expect(await stockOf(o.variantId)).toEqual({ quantity: 6, reserved: 0 });
    expect((await act(id, 'receive')).status).toBe(200);
    expect(await stockOf(o.variantId)).toEqual({ quantity: 6, reserved: 0 }); // damaged: stays out
    expect(await db.select().from(inventoryAdjustments)).toHaveLength(0);
  });

  it('can restock a subset of the lines', async () => {
    const o = await deliveredOrder(app, { quantity: 2, stock: 10 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 2 }]);
    await act(id, 'approve');
    await act(id, 'receive', { restockItemIds: [] });
    expect(await stockOf(o.variantId)).toEqual({ quantity: 8, reserved: 0 });
  });

  it('restocks a kit from the order snapshot, not from what the kit is made of now', async () => {
    const rope = await createProduct({ name: 'Rope', variants: [{ priceCents: 1000, stock: 10 }] });
    const ball = await createProduct({ name: 'Ball', variants: [{ priceCents: 500, stock: 10 }] });
    const extra = await createProduct({ name: 'Bone', variants: [{ priceCents: 300, stock: 10 }] });
    const made = await admin.call('post', '/admin/bundles', {
      name: 'Play Kit',
      slug: 'play-kit',
      description: 'A rope and a ball.',
      priceCents: 2200,
      components: [
        { variantId: rope.variants[0]!.id, qty: 2 },
        { variantId: ball.variants[0]!.id, qty: 1 },
      ],
    });
    const kit = bodyOf<{ data: { variantId: string } }>(made).data;
    const buyer = await signedIn(app, 'customer', 'kitbuyer@grocery.test');
    await buyer.shopper.addToCart(kit.variantId, 1);
    const placed = await buyer.shopper.call('post', '/checkout', {
      email: buyer.user.email,
      shippingAddress: TEST_ADDRESS,
      shippingMethodCode: 'standard',
    });
    const number = bodyOf<{ data: { orderNumber: string } }>(placed).data.orderNumber;
    await simulate(app, number);
    await markDelivered(number);
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 8, reserved: 0 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 9, reserved: 0 });

    // The admin edits the kit after the sale: different parts altogether.
    const edit = await admin.call('patch', `/admin/bundles/${kit.variantId}`, {
      priceCents: 1500,
      components: [
        { variantId: rope.variants[0]!.id, qty: 1 },
        { variantId: extra.variants[0]!.id, qty: 3 },
      ],
    });
    expect(edit.status).toBe(200);

    const [line] = await lines(number);
    const id = await requestReturn({ number, buyer } as unknown as Delivered, [
      { orderItemId: line!.id, quantity: 1 },
    ]);
    await act(id, 'approve');
    await act(id, 'receive');
    expect(await stockOf(rope.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stockOf(ball.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    expect(await stockOf(extra.variants[0]!.id)).toEqual({ quantity: 10, reserved: 0 });
    // The kit itself never gets a stock row.
    expect(
      await db.select().from(inventory).where(eq(inventory.variantId, kit.variantId)),
    ).toHaveLength(0);
  });
});

describe('admin returns: refund safety', () => {
  async function receivedReturn(quantity = 2, price = 1000) {
    const o = await deliveredOrder(app, { quantity, priceCents: price });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    await act(id, 'approve');
    await act(id, 'receive');
    return { o, id, intent: await intentOf(o.number) };
  }

  it('a replayed refund does not refund twice, queue a second email or emit a second event', async () => {
    const { id, intent } = await receivedReturn();
    expect((await act(id, 'refund')).status).toBe(200);
    expect((await act(id, 'refund')).status).toBe(200);
    expect(fake.refundedCents(intent)).toBe(1000);
    expect(fake.callsTo('refund')).toHaveLength(1);
    expect(events).toHaveLength(1);
    await outbox.drain();
    expect(transport.sent.filter((m) => m.subject?.includes('refund'))).toHaveLength(1);
  });

  it('survives a gateway failure: the intent is kept and a retry finishes the same refund', async () => {
    const { o, id, intent } = await receivedReturn();
    fake.failNext('refund');
    const failed = await act(id, 'refund');
    expect(failed.status).toBe(502);
    const [row] = await db.select().from(returns).where(eq(returns.id, id));
    expect(row).toMatchObject({ status: 'received', refundCents: 1000, providerRefundId: null });
    expect(row?.refundIntentAt).toBeInstanceOf(Date);
    expect(fake.refundedCents(intent)).toBe(0);

    expect((await act(id, 'refund')).status).toBe(200);
    expect(fake.refundedCents(intent)).toBe(1000);
    // Same key both times, so a provider that DID get the first call would have answered it.
    expect(fake.callsTo('refund').map((c) => c.args[1])).toEqual([`return-${id}`, `return-${id}`]);
    expect((await orderByNumber(o.number)).status).toBe('delivered');
  });

  it('a retry after the idempotency key expired finds the refund by its return id instead of refunding twice', async () => {
    const { id, intent } = await receivedReturn();
    const real = fake.refundPaymentIntent.bind(fake);
    const spy = vi
      .spyOn(fake, 'refundPaymentIntent')
      .mockImplementationOnce(async (...args: Parameters<typeof real>) => {
        await real(...args);
        throw new Error('crashed before step 3');
      });
    expect((await act(id, 'refund')).status).toBe(500);
    spy.mockRestore();
    expect(fake.refundedCents(intent)).toBe(1000);
    fake.expireIdempotencyKeys(); // a day later
    expect((await act(id, 'refund')).status).toBe(200);
    expect(fake.refundedCents(intent)).toBe(1000);
    const [row] = await db.select().from(returns).where(eq(returns.id, id));
    const listed = await fake.listRefunds(intent);
    expect(listed).toHaveLength(1);
    expect(row).toMatchObject({ status: 'refunded', providerRefundId: listed[0]!.id });
    expect(events).toHaveLength(1);
  });

  it('freezes the shipping choice once the intent exists', async () => {
    const { id } = await receivedReturn();
    fake.failNext('refund');
    expect((await act(id, 'refund', { refundShipping: false })).status).toBe(502);
    const res = await act(id, 'refund', { refundShipping: true });
    expect(res.status).toBe(409);
    expect(errorOf(res).message).toMatch(/already in progress/);
  });

  it('refunds shipping only when ticked, and only once per order', async () => {
    const o = await deliveredOrder(app, { quantity: 2, priceCents: 1000 });
    const order = await orderByNumber(o.number);
    const [line] = await lines(o.number);
    const first = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    const second = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    for (const id of [first, second]) {
      await act(id, 'approve');
      await act(id, 'receive');
    }
    expect((await detail(first)).shippingRefundable).toBe(true);
    const a = bodyOf<Detail>(await act(first, 'refund', { refundShipping: true }));
    expect(a.data.return.refundCents).toBe(1000 + order.shippingCents);
    expect((await detail(second)).shippingRefundable).toBe(false);
    const b = await act(second, 'refund', { refundShipping: true });
    expect(b.status).toBe(409);
    expect(errorOf(b).message).toMatch(/already refunded/);
    expect((await act(second, 'refund')).status).toBe(200);
    expect(fake.refundedCents(await intentOf(o.number))).toBe(2000 + order.shippingCents);
    // Everything came back but the order itself is refunded only for the money it holds.
    expect((await orderByNumber(o.number)).status).toBe('refunded');
  });

  it('refuses to refund a return of an order that is no longer delivered', async () => {
    const { o, id } = await receivedReturn();
    await db.update(orders).set({ status: 'refunded' }).where(eq(orders.number, o.number));
    expect((await act(id, 'refund')).status).toBe(409);
  });

  it('a rejected return in between never lets a line refund more than was paid', async () => {
    const o = await deliveredOrder(app, { quantity: 3, priceCents: 1000 });
    const order = await orderByNumber(o.number);
    const [line] = await lines(o.number);
    // The customer paid 1000 for the whole line (an order discount), so unit shares are 333/333/334.
    await db.update(orderItems).set({ discountCents: 2000 }).where(eq(orderItems.id, line!.id));
    const [a, b, c] = [
      await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]),
      await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]),
      await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]),
    ] as [string, string, string];
    expect((await act(a, 'reject', { reason: 'Used and dirty' })).status).toBe(200);
    const d = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    for (const id of [b, c, d]) {
      await act(id, 'approve');
      await act(id, 'receive');
      expect((await act(id, 'refund')).status).toBe(200);
    }
    const rows = await db.select().from(returns).where(eq(returns.orderId, order.id));
    const sum = rows.filter((r) => r.status === 'refunded').reduce((s, r) => s + r.refundCents, 0);
    expect(sum).toBe(1000);
    expect(fake.refundedCents(await intentOf(o.number))).toBe(1000);
    expect((await orderByNumber(o.number)).status).toBe('refunded');
  });

  it('a charge.refunded webhook between the gateway call and the mark neither strands nor double-counts the return', async () => {
    const o = await deliveredOrder(app, { quantity: 2, priceCents: 1000 });
    const order = await orderByNumber(o.number);
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 2 }]);
    await act(id, 'approve');
    await act(id, 'receive');
    const real = fake.refundPaymentIntent.bind(fake);
    const spy = vi
      .spyOn(fake, 'refundPaymentIntent')
      .mockImplementation(async (...args: Parameters<typeof real>) => {
        const info = await real(...args);
        // Stripe tells us about the refund while we are still between step 2 and step 3.
        expect((await simulate(app, o.number, 'charge.refunded')).status).toBe(200);
        return info;
      });
    try {
      const res = await act(id, 'refund');
      expect(res.status).toBe(200);
    } finally {
      spy.mockRestore();
    }
    const after = await orderByNumber(o.number);
    expect(after.status).toBe('refunded');
    expect(after.refundedCents).toBe(2000);
    expect((await detail(id)).return.status).toBe('refunded');
    // One full event, carrying the return's real amount (not 0, not a second copy).
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orderId: order.id,
      refundId: id,
      amountCents: 2000,
      full: true,
    });
    // A late duplicate webhook after completion changes nothing.
    await simulate(app, o.number, 'charge.refunded');
    expect(events).toHaveLength(1);
    expect((await act(id, 'refund')).status).toBe(200);
  });

  it('can still finish a refund whose order a webhook already moved to refunded', async () => {
    const o = await deliveredOrder(app, { quantity: 1, priceCents: 1000 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    await act(id, 'approve');
    await act(id, 'receive');
    fake.failNext('refund');
    expect((await act(id, 'refund')).status).toBe(502); // intent written
    await db.update(orders).set({ status: 'refunded' }).where(eq(orders.number, o.number));
    expect((await act(id, 'refund')).status).toBe(200);
    expect((await detail(id)).return.status).toBe('refunded');
  });

  it('never lets returns refund the round-up donation', async () => {
    const o = await deliveredOrder(app, { quantity: 2, priceCents: 1000 });
    const order = await orderByNumber(o.number);
    const [line] = await lines(o.number);
    // A real order with a 200 round-up: total = lines + shipping + donation.
    await db
      .update(orders)
      .set({ donationCents: 200, totalCents: order.totalCents + 200 })
      .where(eq(orders.id, order.id));
    const a = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    const b = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    for (const id of [a, b]) {
      await act(id, 'approve');
      await act(id, 'receive');
    }
    expect((await act(a, 'refund')).status).toBe(200);
    // Pretend earlier refunds already handed back 700 more than the goods (e.g. shipping).
    await db.update(returns).set({ refundCents: 1700 }).where(eq(returns.id, a));
    // 1700 + 1000 fits the total (2790) but not the total without the donation (2590).
    const res = await act(b, 'refund');
    expect(res.status).toBe(409);
    expect(errorOf(res).message).toMatch(/more than the customer paid/);
  });

  it('records a simulated refund without calling the gateway when the flag is on', async () => {
    const simulated = makeTestApp({
      payments: fake,
      outbox,
      config: { returns: { windowDays: 30, simulated: true } },
    });
    const adminSim = (await signedIn(simulated, 'admin', 'sim@grocery.test')).shopper;
    const o = await deliveredOrder(simulated, { quantity: 1 });
    const [line] = await lines(o.number);
    const id = bodyOf<{ data: { id: string } }>(
      await o.buyer.shopper.call('post', `/orders/${o.number}/returns`, {
        reason: 'damaged',
        items: [{ orderItemId: line!.id, quantity: 1 }],
      }),
    ).data.id;
    await adminSim.call('post', `/admin/returns/${id}/approve`, {});
    await adminSim.call('post', `/admin/returns/${id}/receive`, {});
    const res = await adminSim.call('post', `/admin/returns/${id}/refund`, {});
    expect(res.status).toBe(200);
    expect(bodyOf<Detail>(res).data).toMatchObject({ simulatedMode: true });
    const [row] = await db.select().from(returns).where(eq(returns.id, id));
    expect(row).toMatchObject({
      status: 'refunded',
      simulated: true,
      providerRefundId: `sim_return-${id}`,
    });
    expect(fake.callsTo('refund')).toHaveLength(0);
    expect((await orderByNumber(o.number)).status).toBe('refunded');
  });

  it('a gateway that is not configured makes the refund a 502 and nothing is marked refunded', async () => {
    const o = await deliveredOrder(app, { quantity: 1 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    await act(id, 'approve');
    await act(id, 'receive');
    fake.failNext('refund');
    expect((await act(id, 'refund')).status).toBe(502);
    const [row] = await db.select().from(returns).where(eq(returns.id, id));
    expect(row?.status).toBe('received');
  });
});

describe('admin returns: the refund event', () => {
  it('emits one event per refund with the amount and lines, and only the last one is full', async () => {
    const o = await deliveredOrder(app, { quantity: 3, priceCents: 1000 });
    const [line] = await lines(o.number);
    const order = await orderByNumber(o.number);
    const a = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    const b = await requestReturn(o, [{ orderItemId: line!.id, quantity: 2 }]);
    for (const id of [a, b]) {
      await act(id, 'approve');
      await act(id, 'receive');
    }
    await act(a, 'refund');
    await act(b, 'refund');
    expect(events).toHaveLength(2); // the order's own refunded transition adds none
    expect(events[0]).toEqual({
      orderId: order.id,
      refundId: a,
      amountCents: 1000,
      full: false,
      lines: [{ orderItemId: line!.id, quantity: 1, refundCents: 1000 }],
      shippingCents: 0,
      donationCents: 0,
    });
    expect(events[1]).toMatchObject({
      refundId: b,
      amountCents: 2000,
      full: true,
      shippingCents: 0,
    });
    expect(events.reduce((s, e) => s + e.amountCents, 0)).toBe(3000);
  });
});

describe('admin returns: emails', () => {
  it('sends one email per step to the customer', async () => {
    const o = await deliveredOrder(app, { quantity: 1 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    await outbox.drain();
    await act(id, 'approve');
    await act(id, 'receive');
    await act(id, 'refund');
    await outbox.drain();
    const mine = transport.sent.filter((m) => m.to === o.buyer.user.email);
    const subjects = mine.map((m) => m.subject ?? '');
    expect(subjects.some((s) => /got your return request/.test(s))).toBe(true);
    expect(subjects.some((s) => /is approved/.test(s))).toBe(true);
    expect(subjects.some((s) => /We received your return/.test(s))).toBe(true);
    expect(subjects.some((s) => /refund of .* is on its way/.test(s))).toBe(true);
    const approved = mine.find((m) => /is approved/.test(m.subject ?? ''));
    expect(approved?.text).toContain('RMA-');
    expect(approved?.text).toMatch(/post it to/);
  });

  it('tells the customer why a return was declined, and escapes the reason in HTML', async () => {
    const o = await deliveredOrder(app, { quantity: 1 });
    const [line] = await lines(o.number);
    const id = await requestReturn(o, [{ orderItemId: line!.id, quantity: 1 }]);
    await act(id, 'reject', { reason: 'Worn <b>out</b>' });
    await outbox.drain();
    const mail = transport.sent.find((m) => /About your return/.test(m.subject ?? ''));
    expect(mail?.text).toContain('Reason: Worn <b>out</b>');
    expect(mail?.html).toContain('Worn &lt;b&gt;out&lt;/b&gt;');
    expect(mail?.html).not.toContain('<b>out</b>');
  });
});
