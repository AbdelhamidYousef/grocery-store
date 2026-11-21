import { and, eq } from 'drizzle-orm';
import { pino } from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { emailOutbox, orderItems, orders, payments } from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp, TEST_HOOK_SECRET } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { TEST_ADDRESS, orderByNumber, signedIn, simulate, stockOf } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { expectBatchInvariant } from '../../test/stock.ts';
import { createOutbox } from '../mail/outbox.ts';
import { transitionOrder } from '../orders/service.ts';

import { captureOverdue, capturePayment, finalAmountCents, finalizeOrder } from './capture.ts';

const log = pino({ level: 'silent' });
let fake: FakeStripe;
let transport: MemoryTransport;
let app: ReturnType<typeof makeTestApp>;
let deps: { gateway: FakeStripe; log: typeof log };

beforeEach(async () => {
  fake = new FakeStripe();
  transport = new MemoryTransport();
  app = makeTestApp({ payments: fake, outbox: createOutbox({ transport, log }) });
  deps = { gateway: fake, log };
  await createShippingMethods();
});
afterEach(expectBatchInvariant);

// 2 x "about 500 g" bananas at 3.78/kg (estimate 1.89 each = 3.78) and one plain 5.00 item.
async function placeMixed(opts: { pay?: boolean } = {}) {
  const bananas = await createProduct({
    name: 'Bananas',
    variants: [
      {
        priceCents: 189,
        stock: 20,
        netAmount: 500,
        netUnit: 'g',
        weight: { pricePerKgCents: 378, nominalGrams: 500 },
      },
    ],
  });
  const tin = await createProduct({ name: 'Tin', variants: [{ priceCents: 500, stock: 20 }] });
  const shopper = makeShopper(app);
  await shopper.addToCart(bananas.variants[0]!.id, 2);
  await shopper.addToCart(tin.variants[0]!.id, 1);
  const res = await shopper.call('post', '/checkout', {
    email: 'ada@grocery.test',
    shippingAddress: TEST_ADDRESS,
    shippingMethodCode: 'standard',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  if (opts.pay !== false) expect((await simulate(app, number)).status).toBe(200);
  const order = await orderByNumber(number);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const banana = items.find((i) => i.productName === 'Bananas')!;
  return { number, order, items, banana, bananaVariant: bananas.variants[0]!.id };
}

async function reload(number: string) {
  const order = await orderByNumber(number);
  const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
  return { order, payment: payment! };
}

describe('authorising at checkout', () => {
  it('authorises the total plus 15 % of the weighed lines, with manual capture', async () => {
    const { order } = await placeMixed({ pay: false });
    // Lines: 2 x 189 weighed + 500 = 878 plus shipping; the buffer is 15 % of the weighed 378 = 57.
    expect(order.totalCents).toBeGreaterThanOrEqual(878);
    expect(order.authorizedCents).toBe(order.totalCents + 57);
    const create = fake.callsTo('create')[0]!.args[0] as Record<string, unknown>;
    expect(create).toMatchObject({ amountCents: order.authorizedCents, captureMethod: 'manual' });
    const { payment } = await reload(order.number);
    expect(payment).toMatchObject({
      amountCents: order.authorizedCents,
      captureMethod: 'manual',
      status: 'requires_payment',
    });
  });

  it('authorises exactly the total when nothing is weighed', async () => {
    const tin = await createProduct({ variants: [{ priceCents: 500, stock: 5 }] });
    const shopper = makeShopper(app);
    await shopper.addToCart(tin.variants[0]!.id, 2);
    const res = await shopper.call('post', '/checkout', {
      email: 'ada@grocery.test',
      shippingAddress: TEST_ADDRESS,
      shippingMethodCode: 'standard',
    });
    const order = await orderByNumber(
      bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber,
    );
    expect(order.authorizedCents).toBe(order.totalCents);
    expect(order.capturedCents).toBeNull();
  });
});

describe('the webhook: requires_capture secures the order', () => {
  it('marks it paid as succeeded did (stock, history, confirmation mail) and the payment authorized', async () => {
    const { number, order, bananaVariant } = await placeMixed({ pay: false });
    const before = await stockOf(bananaVariant);
    expect(before).toEqual({ quantity: 20, reserved: 2 });
    const res = await simulate(app, number, 'payment_intent.amount_capturable_updated');
    expect(bodyOf<{ data: { outcome: string } }>(res).data.outcome).toBe('processed');
    const { order: paid, payment } = await reload(number);
    expect(paid.status).toBe('paid');
    expect(payment.status).toBe('authorized');
    expect(paid.capturedCents).toBeNull();
    expect(await stockOf(bananaVariant)).toEqual({ quantity: 18, reserved: 0 });
    const mails = await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, order.id));
    expect(mails.map((m) => m.kind)).toEqual(['order_confirmation']);
  });

  it('the default simulated payment of a manual order is the authorisation event', async () => {
    const { number } = await placeMixed();
    const { payment } = await reload(number);
    expect(payment.status).toBe('authorized');
  });

  it('refuses an authorisation for another amount than the order is held for', async () => {
    const { number } = await placeMixed({ pay: false });
    const res = await request(app)
      .post('/api/v1/test/webhooks/simulate')
      .set('X-Test-Hook-Secret', TEST_HOOK_SECRET)
      .send({
        orderNumber: number,
        type: 'payment_intent.amount_capturable_updated',
        amountReceivedCents: 100,
      });
    expect(bodyOf<{ data: { outcome: string } }>(res).data.outcome).toBe('processed');
    expect((await reload(number)).order.status).toBe('pending_payment');
  });

  it('still confirms an automatic-capture order from before the change with payment_intent.succeeded', async () => {
    const { number, order } = await placeMixed({ pay: false });
    await db
      .update(payments)
      .set({ captureMethod: 'automatic' })
      .where(eq(payments.orderId, order.id));
    await db.update(orders).set({ authorizedCents: null }).where(eq(orders.id, order.id));
    const intentId = (await reload(number)).payment.providerPaymentIntentId!;
    await fake.updatePaymentIntentAmount(intentId, order.totalCents);
    await db
      .update(payments)
      .set({ amountCents: order.totalCents })
      .where(eq(payments.orderId, order.id));
    const res = await simulate(app, number); // automatic payment: the plain succeeded event
    expect(bodyOf<{ data: { outcome: string } }>(res).data.outcome).toBe('processed');
    const { order: paid, payment } = await reload(number);
    expect(paid.status).toBe('paid');
    expect(payment.status).toBe('succeeded');
    // Nothing to capture on such an order.
    await expect(finalizeOrder(deps, paid.id, { actor: 'admin:t@t.test' })).rejects.toMatchObject({
      status: 409,
    });
    expect(fake.callsTo('capture')).toHaveLength(0);
  });

  it('records a capture made outside the app when the succeeded event arrives', async () => {
    const { number } = await placeMixed();
    const res = await simulate(app, number, 'payment_intent.succeeded');
    expect(bodyOf<{ data: { outcome: string } }>(res).data.outcome).toBe('processed');
    const { order, payment } = await reload(number);
    expect(payment.status).toBe('succeeded');
    expect(order.capturedCents).toBe(order.authorizedCents);
  });
});

describe('capturing the weighed amount', () => {
  it('captures less than authorised, records it once, and sends the final bill', async () => {
    const { number, order, banana } = await placeMixed();
    // 2 packs weigh 940 g in all: 378 * 940 / 1000 = 355.32 -> 355 (estimate was 378).
    const result = await finalizeOrder(deps, order.id, {
      actor: 'admin:boss@grocery.test',
      weights: [{ orderItemId: banana.id, grams: 940 }],
    });
    expect(result).toEqual({
      orderNumber: number,
      authorizedCents: order.authorizedCents,
      capturedCents: order.totalCents - 378 + 355,
      alreadyCaptured: false,
    });
    expect(fake.captured.map(({ amountCents, key }) => ({ amountCents, key }))).toEqual([
      { amountCents: order.totalCents - 23, key: `capture:${order.id}` },
    ]);
    const { order: after, payment } = await reload(number);
    expect(after.capturedCents).toBe(order.totalCents - 23);
    expect(payment.status).toBe('succeeded');
    const [line] = await db.select().from(orderItems).where(eq(orderItems.id, banana.id));
    expect(line).toMatchObject({ weighedGrams: 940, finalCents: 355, pricePerKgCents: 378 });
    const mails = await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, order.id));
    expect(mails.map((m) => m.kind).sort()).toEqual(['order_confirmation', 'order_final_bill']);
  });

  it('charges the hold, not more, when the bag weighs more than the buffer allows', async () => {
    const { number, order, banana } = await placeMixed();
    const result = await finalizeOrder(deps, order.id, {
      actor: 'admin:boss@grocery.test',
      weights: [{ orderItemId: banana.id, grams: 3000 }], // 11.34 EUR for an 3.78 estimate
    });
    expect(result.capturedCents).toBe(order.authorizedCents);
    const { order: after } = await reload(number);
    expect(after.capturedCents).toBe(order.authorizedCents);
  });

  it('refuses to capture more than was authorised, before calling Stripe', async () => {
    const { order } = await placeMixed();
    await expect(
      capturePayment(deps, order.id, order.authorizedCents! + 1, 'admin:boss@grocery.test'),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      capturePayment(deps, order.id, 0, 'admin:boss@grocery.test'),
    ).rejects.toMatchObject({
      status: 422,
    });
    expect(fake.callsTo('capture')).toHaveLength(0);
    expect((await orderByNumber(order.number)).capturedCents).toBeNull();
  });

  it('is idempotent: a second finalize sends nothing to Stripe and records nothing twice', async () => {
    const { order, banana } = await placeMixed();
    const first = await finalizeOrder(deps, order.id, {
      actor: 'a',
      weights: [{ orderItemId: banana.id, grams: 1000 }],
    });
    const again = await finalizeOrder(deps, order.id, { actor: 'a' });
    expect(again).toMatchObject({ capturedCents: first.capturedCents, alreadyCaptured: true });
    expect(fake.callsTo('capture')).toHaveLength(1);
    const mails = await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, order.id));
    expect(mails.filter((m) => m.kind === 'order_final_bill')).toHaveLength(1);
    const history = await db.execute(
      // one capture row in the history
      (await import('drizzle-orm'))
        .sql`select count(*)::int as n from order_status_history where order_id = ${order.id} and note like 'Captured %'`,
    );
    expect(history[0]).toEqual({ n: 1 });
  });

  it('two captures at the same moment take the money once', async () => {
    const { order } = await placeMixed();
    const [a, b] = await Promise.all([
      finalizeOrder(deps, order.id, { actor: 'a' }),
      finalizeOrder(deps, order.id, { actor: 'b' }),
    ]);
    expect(a.capturedCents).toBe(b.capturedCents);
    expect(fake.captured).toHaveLength(1);
    expect([a.alreadyCaptured, b.alreadyCaptured].filter(Boolean).length).toBeLessThanOrEqual(1);
    const mails = await db.select().from(emailOutbox).where(eq(emailOutbox.orderId, order.id));
    expect(mails.filter((m) => m.kind === 'order_final_bill')).toHaveLength(1);
  });

  it('a retry after Stripe answered but the write was lost gets the same capture back', async () => {
    const { order } = await placeMixed();
    // The capture happens at Stripe, the record is lost (crash): nothing on our side says captured.
    const payment = (await reload(order.number)).payment;
    await fake.capturePaymentIntent(
      payment.providerPaymentIntentId!,
      order.totalCents,
      `capture:${order.id}`,
    );
    const result = await finalizeOrder(deps, order.id, { actor: 'a' });
    expect(result.capturedCents).toBe(order.totalCents);
    expect(fake.captured).toHaveLength(1); // the same key: Stripe took nothing twice
  });

  it('refuses to capture an order that is not paid, or whose payment is not authorised', async () => {
    const { order: pending } = await placeMixed({ pay: false });
    await expect(finalizeOrder(deps, pending.id, { actor: 'a' })).rejects.toMatchObject({
      status: 409,
    });
    const { order, banana } = await placeMixed();
    await expect(
      finalizeOrder(deps, order.id, {
        actor: 'a',
        weights: [{ orderItemId: '00000000-0000-4000-8000-000000000000', grams: 5 }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    const plain = (await db.select().from(orderItems).where(eq(orderItems.orderId, order.id))).find(
      (i) => i.id !== banana.id,
    )!;
    await expect(
      finalizeOrder(deps, order.id, { actor: 'a', weights: [{ orderItemId: plain.id, grams: 5 }] }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fake.callsTo('capture')).toHaveLength(0);
  });

  it('works out the final amount from the lines: weighed ones really, the rest as priced', () => {
    const order = { totalCents: 1177, authorizedCents: 1234 };
    expect(
      finalAmountCents(order, [
        { lineTotalCents: 378, finalCents: 355 },
        { lineTotalCents: 500, finalCents: null },
      ]),
    ).toEqual({ amountCents: 1154, capped: false });
    expect(finalAmountCents(order, [{ lineTotalCents: 378, finalCents: 900 }])).toEqual({
      amountCents: 1234,
      capped: true,
    });
    expect(finalAmountCents({ totalCents: 500, authorizedCents: null }, [])).toEqual({
      amountCents: 500,
      capped: false,
    });
  });

  it('the admin can capture now over the API, and a customer cannot', async () => {
    const { number, banana } = await placeMixed();
    const customer = await signedIn(app, 'customer');
    expect(
      (await customer.shopper.call('post', `/admin/orders/${number}/capture`, {})).status,
    ).toBe(403);
    const admin = await signedIn(app, 'admin', 'boss@grocery.test');
    const res = await admin.shopper.call('post', `/admin/orders/${number}/capture`, {
      weights: [{ orderItemId: banana.id, grams: 990 }],
    });
    expect(res.status).toBe(200);
    const detail = bodyOf<{
      data: {
        order: { capturedCents: number; authorizedCents: number };
        payment: { status: string };
      };
    }>(res).data;
    expect(detail.payment.status).toBe('succeeded');
    expect(detail.order.capturedCents).toBeLessThanOrEqual(detail.order.authorizedCents);
  });
});

describe('capture-overdue', () => {
  const age = (id: string, days: number) =>
    db
      .update(orders)
      .set({ placedAt: new Date(Date.now() - days * 86_400_000) })
      .where(eq(orders.id, id));

  it('captures orders authorised more than five days ago at their estimate, and leaves younger ones', async () => {
    const old = await placeMixed();
    const young = await placeMixed();
    await age(old.order.id, 5.5);
    await age(young.order.id, 4.5);
    const result = await captureOverdue(deps);
    expect(result).toEqual({ examined: 1, captured: 1, failed: 0 });
    expect((await orderByNumber(old.number)).capturedCents).toBe(old.order.totalCents);
    expect((await orderByNumber(young.number)).capturedCents).toBeNull();
    // Running again finds nothing.
    expect(await captureOverdue(deps)).toEqual({ examined: 0, captured: 0, failed: 0 });
  });

  it('uses the weighed amount of a line that was weighed, and survives one failing order', async () => {
    const a = await placeMixed();
    const b = await placeMixed();
    await age(a.order.id, 6);
    await age(b.order.id, 6);
    await db
      .update(orderItems)
      .set({ weighedGrams: 900, finalCents: 340 })
      .where(eq(orderItems.id, a.banana.id));
    fake.failNext('capture'); // the first order's capture fails, the second still goes through
    const result = await captureOverdue(deps);
    expect(result).toMatchObject({ examined: 2, failed: 1, captured: 1 });
    const rows = await db
      .select({ number: orders.number, captured: orders.capturedCents })
      .from(orders)
      .where(and(eq(orders.status, 'paid')));
    expect(rows.filter((r) => r.captured !== null)).toHaveLength(1);
    // The retry (the next hourly run) takes the one that failed.
    expect(await captureOverdue(deps)).toMatchObject({ examined: 1, captured: 1, failed: 0 });
    const a2 = await orderByNumber(a.number);
    expect(a2.capturedCents).toBe(a.order.totalCents - 378 + 340);
  });
});

describe('cancelling and refunding around a capture', () => {
  it('cancelling an authorised order cancels the intent: no refund, stock back, payment not charged', async () => {
    const { number, bananaVariant } = await placeMixed();
    await transitionOrder(deps, number, 'cancelled', { actor: 'admin:boss@grocery.test' });
    const intentId = (await reload(number)).payment.providerPaymentIntentId!;
    expect(fake.cancelled).toContain(intentId);
    expect(fake.refunded).toEqual([]);
    const { order: after, payment } = await reload(number);
    expect(after.status).toBe('cancelled');
    expect(payment.status).toBe('failed');
    expect(after.capturedCents).toBeNull();
    expect(await stockOf(bananaVariant)).toEqual({ quantity: 20, reserved: 0 });
  });

  it('a captured order is refunded, not cancelled at Stripe', async () => {
    const { number, order } = await placeMixed();
    await finalizeOrder(deps, order.id, { actor: 'a' });
    await transitionOrder(deps, number, 'cancelled', { actor: 'admin:boss@grocery.test' });
    expect(fake.refunded).toHaveLength(1);
    expect(fake.refundedCents(fake.refunded[0]!)).toBe(order.totalCents);
    expect((await reload(number)).payment.status).toBe('refunded');
  });

  it('cancelling an authorised order that was captured in the meantime refunds it', async () => {
    const { number, order } = await placeMixed();
    const { payment } = await reload(number);
    // Captured at Stripe (the dashboard) while our row still says authorised.
    await fake.capturePaymentIntent(payment.providerPaymentIntentId!, order.totalCents, 'dash');
    await transitionOrder(deps, number, 'cancelled', { actor: 'admin:boss@grocery.test' });
    expect(fake.refunded).toHaveLength(1);
  });
});

describe('the stale-reservation sweeper', () => {
  it('never cancels an authorised intent of an order it finds still pending', async () => {
    const { number, order } = await placeMixed({ pay: false });
    const { payment } = await reload(number);
    fake.setStatus(payment.providerPaymentIntentId!, 'requires_capture');
    await db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - 2 * 3_600_000) })
      .where(eq(orders.id, order.id));
    const { releaseStaleReservations } = await import('../../jobs/release-stale-reservations.ts');
    const result = await releaseStaleReservations({ gateway: fake, log });
    expect(result).toMatchObject({ recovered: 1, released: 0 });
    expect(fake.cancelled).toEqual([]);
    expect((await reload(number)).payment.status).toBe('authorized');
  });
});
