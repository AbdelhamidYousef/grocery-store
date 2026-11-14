import { eq, sql } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../db/client.ts';
import { carts, inventory, orderStatusHistory, orders, payments } from '../db/schema/index.ts';
import type { PaymentGateway } from '../lib/stripe.ts';
import { cancelPendingOrder } from '../modules/checkout/orders.ts';
import { makeTestApp } from '../test/app.ts';
import { createProduct, createShippingMethods } from '../test/factories.ts';
import { FakeStripe } from '../test/fake-stripe.ts';
import { bodyOf } from '../test/http.ts';
import { makeShopper } from '../test/shopper.ts';

import {
  releaseStaleReservations,
  runExclusiveSweep,
  startReservationSweeper,
} from './release-stale-reservations.ts';

const log = pino({ level: 'silent' });
let stripe: FakeStripe;
let app: ReturnType<typeof makeTestApp>;
beforeEach(async () => {
  stripe = new FakeStripe();
  app = makeTestApp({ payments: stripe });
  await createShippingMethods();
});

const sweep = (gateway: PaymentGateway = stripe) => releaseStaleReservations({ gateway, log });

async function pendingOrder(quantity = 2, stock = 10) {
  const { variants } = await createProduct({ variants: [{ priceCents: 1000, stock }] });
  const shopper = makeShopper(app);
  await shopper.addToCart(variants[0]!.id, quantity);
  const res = await shopper.call('post', '/checkout', {
    email: 'ada@grocery.test',
    shippingAddress: {
      fullName: 'Ada Lovelace',
      line1: '1 Bone Street',
      city: 'Riga',
      postalCode: 'LV-1010',
      country: 'DE',
    },
    shippingMethodCode: 'standard',
  });
  const number = bodyOf<{ data: { orderNumber: string } }>(res).data.orderNumber;
  const [order] = await db.select().from(orders).where(eq(orders.number, number));
  return { variantId: variants[0]!.id, orderId: order!.id, number };
}

// 31 minutes old: past the 30-minute window. (Only created_at is changed; the updated_at trigger is
// irrelevant to the sweeper.)
const age = (orderId: string, minutes = 31) =>
  db
    .update(orders)
    .set({ createdAt: new Date(Date.now() - minutes * 60_000) })
    .where(eq(orders.id, orderId));

const orderOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;
const stockOf = async (variantId: string) => {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
  return { quantity: row!.quantity, reserved: row!.reserved };
};

describe('releaseStaleReservations', () => {
  it('leaves a recent pending order alone', async () => {
    const { orderId, variantId } = await pendingOrder();
    await age(orderId, 5);
    expect(await sweep()).toMatchObject({ examined: 0, released: 0 });
    expect((await orderOf(orderId)).status).toBe('pending_payment');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 2 });
  });

  it('cancels an abandoned order: intent cancelled, order cancelled, stock back on the shelf', async () => {
    const { orderId, variantId } = await pendingOrder();
    await age(orderId);

    expect(await sweep()).toMatchObject({ examined: 1, released: 1, recovered: 0, failed: 0 });

    expect(stripe.cancelled).toEqual(['pi_fake_1']);
    expect((await orderOf(orderId)).status).toBe('cancelled');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
    expect((await db.select().from(payments))[0]).toMatchObject({ status: 'failed' });
    const history = await db.select().from(orderStatusHistory);
    expect(history.find((h) => h.toStatus === 'cancelled')).toMatchObject({
      actor: 'system:reconciler',
    });
    // The shopper still has their cart: abandoning a payment does not cost them the basket.
    expect((await db.select().from(carts))[0]?.status).toBe('active');
  });

  it('recovers a payment whose webhook was lost, exactly as the webhook would have', async () => {
    const { orderId, variantId } = await pendingOrder();
    stripe.setStatus('pi_fake_1', 'succeeded');
    await age(orderId);

    expect(await sweep()).toMatchObject({ examined: 1, recovered: 1, released: 0 });

    const order = await orderOf(orderId);
    expect(order.status).toBe('paid');
    expect(order.placedAt).toBeInstanceOf(Date);
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
    expect((await db.select().from(carts))[0]?.status).toBe('converted');
    expect(stripe.cancelled).toEqual([]);
    const history = await db.select().from(orderStatusHistory);
    expect(history.find((h) => h.toStatus === 'paid')).toMatchObject({
      actor: 'system:reconciler',
    });
  });

  it('does not touch an order whose payment is processing', async () => {
    const { orderId, variantId } = await pendingOrder();
    stripe.setStatus('pi_fake_1', 'processing');
    await age(orderId);
    expect(await sweep()).toMatchObject({ examined: 1, skipped: 1, released: 0 });
    expect((await orderOf(orderId)).status).toBe('pending_payment');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 2 });
    expect(stripe.cancelled).toEqual([]);
  });

  it('leaves an order pending (and says so) when Stripe reports a different amount than ordered', async () => {
    const { orderId } = await pendingOrder();
    stripe.setStatus('pi_fake_1', 'succeeded', 7);
    await age(orderId);
    expect(await sweep()).toMatchObject({ recovered: 0, skipped: 1 });
    expect((await orderOf(orderId)).status).toBe('pending_payment');
    expect((await db.select().from(payments))[0]?.lastError).toMatch(/mismatch/i);
  });

  it('releases an order whose Stripe call never happened (no intent id) without calling Stripe', async () => {
    const { orderId, variantId } = await pendingOrder();
    await db.update(payments).set({ providerPaymentIntentId: null });
    await age(orderId);
    stripe.calls.length = 0;
    expect(await sweep()).toMatchObject({ released: 1 });
    expect(stripe.calls).toHaveLength(0);
    expect((await orderOf(orderId)).status).toBe('cancelled');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });

  it('confirms instead of cancelling when the shopper pays at the very moment of the sweep', async () => {
    const { orderId, variantId } = await pendingOrder();
    await age(orderId);
    // Retrieve still says "not paid", but by the time we cancel, Stripe reports it succeeded.
    const racing: PaymentGateway = {
      createPaymentIntent: (i) => stripe.createPaymentIntent(i),
      updatePaymentIntentAmount: (id, a) => stripe.updatePaymentIntentAmount(id, a),
      retrievePaymentIntent: (id) => stripe.retrievePaymentIntent(id),
      cancelPaymentIntent: async (id) => {
        stripe.setStatus(id, 'succeeded');
        return stripe.retrievePaymentIntent(id);
      },
      refundPaymentIntent: (id, key) => stripe.refundPaymentIntent(id, key),
      listRefunds: (id) => stripe.listRefunds(id),
      constructWebhookEvent: (b) => stripe.constructWebhookEvent(b),
    };
    expect(await sweep(racing)).toMatchObject({ recovered: 1, released: 0 });
    expect((await orderOf(orderId)).status).toBe('paid');
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
  });

  it('keeps going when one order fails, and retries it on the next sweep', async () => {
    const first = await pendingOrder();
    const second = await pendingOrder();
    await age(first.orderId, 40); // swept first (oldest)
    await age(second.orderId, 35);

    stripe.failNext('retrieve');
    expect(await sweep()).toMatchObject({ examined: 2, failed: 1, released: 1 });
    expect((await orderOf(first.orderId)).status).toBe('pending_payment');
    expect((await orderOf(second.orderId)).status).toBe('cancelled');

    expect(await sweep()).toMatchObject({ examined: 1, failed: 0, released: 1 });
    expect((await orderOf(first.orderId)).status).toBe('cancelled');
  });

  it('is idempotent: a second sweep finds nothing, and paid or cancelled orders are never examined', async () => {
    const { orderId, variantId } = await pendingOrder();
    await age(orderId);
    await sweep();
    expect(await sweep()).toMatchObject({ examined: 0 });
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });

  it('does not release stock twice when a cancel webhook already arrived', async () => {
    const { orderId, variantId } = await pendingOrder();
    await db.transaction((tx) =>
      cancelPendingOrder(tx, orderId, { actor: 'system:webhook', note: 'x' }),
    );
    await age(orderId);
    expect(await sweep()).toMatchObject({ examined: 0 });
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });
});

describe('runExclusiveSweep', () => {
  it('runs a sweep and returns its result', async () => {
    const { orderId } = await pendingOrder();
    await age(orderId);
    expect(await runExclusiveSweep({ gateway: stripe, log })).toMatchObject({ released: 1 });
  });

  it('skips (null) while another sweeper holds the lock', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(80700001)`);
      // Another connection, i.e. another instance, asks for the same lock.
      return runExclusiveSweep({ gateway: stripe, log });
    });
    expect(result).toBeNull();
  });
});

describe('startReservationSweeper', () => {
  it('sweeps on its own schedule and stops when told to', async () => {
    const { orderId } = await pendingOrder();
    await age(orderId);
    const job = startReservationSweeper({
      gateway: stripe,
      log,
      intervalMs: 50,
      firstRunDelayMs: 10,
    });
    try {
      await expect
        .poll(async () => (await orderOf(orderId)).status, { timeout: 5000 })
        .toBe('cancelled');
    } finally {
      job.stop();
    }
  });
});
