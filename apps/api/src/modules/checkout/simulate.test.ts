import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { inventory, orders, payments, webhookEvents } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { makeShopper } from '../../test/shopper.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  app = makeTestApp({ payments: new FakeStripe() });
  await createShippingMethods();
});

async function pendingOrder() {
  const { variants } = await createProduct({ variants: [{ priceCents: 1000, stock: 10 }] });
  const guest = makeShopper(app);
  await guest.addToCart(variants[0]!.id, 2);
  const res = await guest.call('post', '/checkout', {
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
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  return { guest, number, variantId: variants[0]!.id };
}

// A script, not a browser: no cookies and no Origin header.
const simulate = (body: object, target = app) =>
  request(target).post('/api/v1/test/webhooks/simulate').send(body);

describe('POST /test/webhooks/simulate (NODE_ENV=test only)', () => {
  it('confirms a payment through the real handler, so the status poll sees `paid`', async () => {
    const { guest, number, variantId } = await pendingOrder();
    const res = await simulate({ orderNumber: number });
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { outcome: string } }>(res).data.outcome).toBe('processed');

    const status = await guest.call('get', `/checkout/orders/${number}/status`);
    expect(bodyOf<{ data: unknown }>(status).data).toEqual({
      status: 'paid',
      paymentStatus: 'succeeded',
    });
    const [stock] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
    expect(stock).toMatchObject({ quantity: 8, reserved: 0 });
    const [event] = await db.select().from(webhookEvents);
    expect(event?.id).toMatch(/^evt_sim_/);
    expect(event?.processedAt).toBeInstanceOf(Date);
  });

  it('is safe to call twice: the order is paid once and stock moves once', async () => {
    const { number, variantId } = await pendingOrder();
    await simulate({ orderNumber: number });
    await simulate({ orderNumber: number });
    const [stock] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
    expect(stock).toMatchObject({ quantity: 8, reserved: 0 });
  });

  it('can simulate a decline, a cancellation, a refund and an amount mismatch', async () => {
    const declined = await pendingOrder();
    await simulate({
      orderNumber: declined.number,
      type: 'payment_intent.payment_failed',
      errorMessage: 'Your card was declined.',
    });
    expect((await db.select().from(payments).where(eq(payments.status, 'failed'))).length).toBe(1);
    expect(
      (await db.select().from(orders).where(eq(orders.number, declined.number)))[0]?.status,
    ).toBe('pending_payment');

    const cancelled = await pendingOrder();
    await simulate({ orderNumber: cancelled.number, type: 'payment_intent.canceled' });
    expect(
      (await db.select().from(orders).where(eq(orders.number, cancelled.number)))[0]?.status,
    ).toBe('cancelled');

    const refunded = await pendingOrder();
    await simulate({ orderNumber: refunded.number });
    await simulate({ orderNumber: refunded.number, type: 'charge.refunded' });
    expect(
      (await db.select().from(orders).where(eq(orders.number, refunded.number)))[0]?.status,
    ).toBe('refunded');

    const mismatch = await pendingOrder();
    await simulate({ orderNumber: mismatch.number, amountReceivedCents: 5 });
    expect(
      (await db.select().from(orders).where(eq(orders.number, mismatch.number)))[0]?.status,
    ).toBe('pending_payment');
  });

  it('answers 404 for an unknown order and 400 for a bad body', async () => {
    expect((await simulate({ orderNumber: 'PW-2026-424242' })).status).toBe(404);
    expect((await simulate({ type: 'payment_intent.succeeded' })).status).toBe(400);
    expect((await simulate({ orderNumber: 'x', type: 'customer.deleted' })).status).toBe(400);
  });

  it('does not exist outside NODE_ENV=test', async () => {
    for (const nodeEnv of ['development', 'production'] as const) {
      const other = makeTestApp({ config: { nodeEnv }, payments: new FakeStripe() });
      const res = await request(other)
        .post('/api/v1/test/webhooks/simulate')
        .set('Origin', 'http://localhost:5173')
        .send({ orderNumber: 'PW-2026-000001' });
      expect(res.status).toBe(404);
    }
  });

  it('is not CSRF-exempt outside test: a cross-origin POST there is refused before routing', async () => {
    const dev = makeTestApp({ config: { nodeEnv: 'development' }, payments: new FakeStripe() });
    const res = await request(dev)
      .post('/api/v1/test/webhooks/simulate')
      .send({ orderNumber: 'PW-2026-000001' });
    expect(res.status).toBe(403);
  });
});
