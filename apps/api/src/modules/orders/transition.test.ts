import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, afterEach } from 'vitest';

import { db } from '../../db/client.ts';
import { orderStatusHistory, orders, payments } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { orderByNumber, placeOrder, simulate, stockOf } from '../../test/orders.ts';
import { expectBatchInvariant } from '../../test/stock.ts';

import { transitionOrder } from './service.ts';

const log = pino({ level: 'silent' });
let fake: FakeStripe;
let app: ReturnType<typeof makeTestApp>;

beforeEach(async () => {
  fake = new FakeStripe();
  app = makeTestApp({ payments: fake });
  await createShippingMethods();
});

const move = (number: string, to: Parameters<typeof transitionOrder>[2], note?: string) =>
  transitionOrder({ gateway: fake, log }, number, to, { actor: 'admin:boss@grocery.test', note });

const historyOf = async (orderId: string) =>
  (await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)))
    .map((h) => `${h.fromStatus ?? '-'}>${h.toStatus}@${h.actor}`)
    .sort();

// Whatever a test did to stock, the batches still add up to every stock row.
afterEach(expectBatchInvariant);

describe('transitionOrder (side effects through the state machine)', () => {
  it('walks paid -> processing -> shipped -> delivered and records each step with the actor', async () => {
    const { number } = await placeOrder(app);
    await simulate(app, number);
    await move(number, 'processing');
    await move(number, 'shipped', 'Parcel DHL 123');
    const delivered = await move(number, 'delivered');
    expect(delivered.status).toBe('delivered');
    const history = await historyOf(delivered.id);
    expect(history).toContain('shipped>delivered@admin:boss@grocery.test');
    expect(history).toContain('paid>processing@admin:boss@grocery.test');
  });

  it('rejects a skipped step with 409 details and changes nothing', async () => {
    const { number } = await placeOrder(app);
    await simulate(app, number);
    await expect(move(number, 'delivered')).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      details: { from: 'paid', to: 'delivered' },
    });
    expect((await orderByNumber(number)).status).toBe('paid');
  });

  it('refuses to declare an order paid by hand', async () => {
    const { number } = await placeOrder(app);
    await expect(move(number, 'paid')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await orderByNumber(number)).status).toBe('pending_payment');
  });

  it('cancelling a pending order cancels the intent and releases the reservation', async () => {
    const { number, variantId } = await placeOrder(app, { stock: 10, quantity: 3 });
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 3 });
    await move(number, 'cancelled');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
    expect(fake.cancelled).toHaveLength(1);
    expect(fake.refunded).toHaveLength(0);
    const [payment] = await db.select().from(payments);
    expect(payment?.status).toBe('failed');
  });

  it('does not cancel a pending order whose payment just succeeded at Stripe', async () => {
    const { number } = await placeOrder(app);
    const [payment] = await db.select().from(payments);
    fake.setStatus(payment!.providerPaymentIntentId!, 'succeeded');
    await expect(move(number, 'cancelled')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await orderByNumber(number)).status).toBe('pending_payment');
  });

  it('cancelling a paid order refunds in Stripe and puts the units back on the shelf', async () => {
    const { number, variantId } = await placeOrder(app, { stock: 10, quantity: 2 });
    await simulate(app, number);
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
    await move(number, 'cancelled', 'customer asked');
    expect(fake.refunded).toHaveLength(1);
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
    const [payment] = await db.select().from(payments);
    expect(payment?.status).toBe('refunded');
  });

  it('a whole-order refund records everything as handed back', async () => {
    const { number } = await placeOrder(app, { stock: 10, quantity: 2 });
    await simulate(app, number);
    await move(number, 'refunded');
    const [order] = await db.select().from(orders).where(eq(orders.number, number));
    expect(order?.refundedCents).toBe(order?.totalCents);
  });

  it('refunding a paid (unshipped) order restocks, refunding a delivered one does not', async () => {
    const a = await placeOrder(app, { stock: 10, quantity: 2 });
    await simulate(app, a.number);
    await move(a.number, 'refunded');
    expect(await stockOf(a.variantId)).toEqual({ quantity: 10, reserved: 0 });

    const b = await placeOrder(app, { stock: 10, quantity: 2 });
    await simulate(app, b.number);
    for (const to of ['processing', 'shipped', 'delivered', 'refunded'] as const) {
      await move(b.number, to);
    }
    expect(await stockOf(b.variantId)).toEqual({ quantity: 8, reserved: 0 });
    expect(fake.refunded).toHaveLength(2);
  });

  it('a Stripe refund of a shipped order (dashboard) is recorded without restocking', async () => {
    const { number, variantId } = await placeOrder(app, { stock: 10, quantity: 2 });
    await simulate(app, number);
    await move(number, 'processing');
    await move(number, 'shipped');
    await simulate(app, number, 'charge.refunded');
    expect((await orderByNumber(number)).status).toBe('refunded');
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
  });

  it('a webhook refund after an admin refund changes nothing a second time', async () => {
    const { number, variantId } = await placeOrder(app, { stock: 10, quantity: 2 });
    await simulate(app, number);
    await move(number, 'refunded');
    await simulate(app, number, 'charge.refunded');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });

  it('does not touch the database when Stripe refuses the refund', async () => {
    const { number, variantId } = await placeOrder(app, { stock: 10, quantity: 2 });
    await simulate(app, number);
    fake.failNext('refund');
    await expect(move(number, 'cancelled')).rejects.toMatchObject({ status: 502 });
    expect((await orderByNumber(number)).status).toBe('paid');
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
    // Retrying works and refunds once.
    await move(number, 'cancelled');
    expect(fake.refunded).toHaveLength(1);
  });

  it('answers 404 for an unknown order', async () => {
    await expect(move('PW-2026-999999', 'cancelled')).rejects.toMatchObject({ status: 404 });
  });
});
