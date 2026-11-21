import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  carts,
  inventory,
  orderStatusHistory,
  orders,
  payments,
  webhookEvents,
} from '../../db/schema/index.ts';
import { createStripeGateway, type PaymentGateway } from '../../lib/stripe.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { makeShopper } from '../../test/shopper.ts';

// Checkout runs against FakeStripe, but webhook verification is the REAL SDK code path: events are
// signed with `generateTestHeaderString` and a made-up secret, so the whole flow (place order,
// signed event, paid order) runs offline.
const SECRET = 'whsec_test_offline_secret_for_unit_tests';
const signer = new Stripe('sk_test_offline_never_used');

let fake: FakeStripe;
let app: ReturnType<typeof makeTestApp>;

function gatewayWithRealSignatures(stripe: FakeStripe): PaymentGateway {
  const real = createStripeGateway({
    secretKey: 'sk_test_offline_never_used',
    webhookSecret: SECRET,
  });
  return {
    createPaymentIntent: (i) => stripe.createPaymentIntent(i),
    updatePaymentIntentAmount: (id, a) => stripe.updatePaymentIntentAmount(id, a),
    retrievePaymentIntent: (id) => stripe.retrievePaymentIntent(id),
    capturePaymentIntent: (id, a, k) => stripe.capturePaymentIntent(id, a, k),
    cancelPaymentIntent: (id) => stripe.cancelPaymentIntent(id),
    refundPaymentIntent: (id, key) => stripe.refundPaymentIntent(id, key),
    listRefunds: (id) => stripe.listRefunds(id),
    constructWebhookEvent: (body, sig) => real.constructWebhookEvent(body, sig),
  };
}

beforeEach(async () => {
  fake = new FakeStripe();
  app = makeTestApp({ payments: gatewayWithRealSignatures(fake) });
  await createShippingMethods();
});

const address = {
  fullName: 'Ada Lovelace',
  line1: '1 Bone Street',
  city: 'Riga',
  postalCode: '10115',
  country: 'DE',
};

// A pending order for 2 x 10.00 + one bag 0.25 + a slot 2.99 = 2324, paid through the fake intent `pi_fake_1`.
async function pendingOrder() {
  const { variants } = await createProduct({ variants: [{ priceCents: 1000, stock: 10 }] });
  const shopper = makeShopper(app);
  await shopper.addToCart(variants[0]!.id, 2);
  const res = await shopper.call('post', '/checkout', {
    email: 'ada@grocery.test',
    shippingAddress: address,
    shippingMethodCode: 'standard',
  });
  expect(res.status).toBe(200);
  return { variantId: variants[0]!.id, shopper };
}

let eventCounter = 0;
const intentObject = (over: Record<string, unknown> = {}) => ({
  id: 'pi_fake_1',
  object: 'payment_intent',
  amount: 2324,
  amount_received: 2324,
  currency: 'eur',
  ...over,
});
const eventOf = (type: string, object: unknown, id = `evt_${++eventCounter}`) => ({
  id,
  object: 'event',
  type,
  data: { object },
});

// Sends an event the way Stripe does: raw JSON bytes plus a Stripe-Signature header.
function deliver(event: object, opts: { secret?: string; body?: string } = {}) {
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? SECRET,
  });
  return request(app)
    .post('/api/v1/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', header)
    .send(opts.body ?? payload);
}

const succeeded = (over: Record<string, unknown> = {}, id?: string) =>
  eventOf('payment_intent.succeeded', intentObject(over), id);

const theOrder = async () => (await db.select().from(orders))[0]!;
const thePayment = async () => (await db.select().from(payments))[0]!;
const stockOf = async (variantId: string) => {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
  return { quantity: row!.quantity, reserved: row!.reserved };
};

describe('POST /webhooks/stripe signature', () => {
  it('rejects a bad signature with 400 and stores nothing', async () => {
    await pendingOrder();
    const res = await deliver(succeeded(), { secret: 'whsec_not_our_secret' });
    expect(res.status).toBe(400);
    expect((await theOrder()).status).toBe('pending_payment');
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it('rejects a body changed after signing (the amount cannot be edited in transit)', async () => {
    await pendingOrder();
    const event = succeeded();
    const forged = JSON.stringify(event).replace('2324', '1');
    const res = await deliver(event, { body: forged });
    expect(res.status).toBe(400);
    expect((await theOrder()).status).toBe('pending_payment');
  });

  it('rejects a request with no signature header or a non-JSON body', async () => {
    const noHeader = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(succeeded()));
    expect(noHeader.status).toBe(400);
    const wrongType = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'text/plain')
      .send('hello');
    expect(wrongType.status).toBe(400);
  });

  it('needs no Origin header: it is called by Stripe, not a browser', async () => {
    await pendingOrder();
    expect((await deliver(succeeded())).status).toBe(200);
  });
});

describe('payment_intent.succeeded', () => {
  it('marks the order paid, turns the reservation into a decrement and converts the cart', async () => {
    const { variantId } = await pendingOrder();
    const res = await deliver(succeeded({}, 'evt_paid'));
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { duplicate: boolean } }>(res).data.duplicate).toBe(false);

    const order = await theOrder();
    expect(order.status).toBe('paid');
    expect(order.placedAt).toBeInstanceOf(Date);
    expect(await thePayment()).toMatchObject({ status: 'succeeded', lastError: null });
    // 10 in stock, 2 sold: the shelf shrinks and the hold disappears.
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
    expect((await db.select().from(carts))[0]?.status).toBe('converted');

    const history = await db.select().from(orderStatusHistory);
    expect(history.find((h) => h.toStatus === 'paid')).toMatchObject({
      fromStatus: 'pending_payment',
      actor: 'system:webhook',
    });
    const [event] = await db.select().from(webhookEvents);
    expect(event).toMatchObject({ id: 'evt_paid', type: 'payment_intent.succeeded', error: null });
    expect(event?.processedAt).toBeInstanceOf(Date);
  });

  it('ignores a second delivery of the same event: stock is decremented once', async () => {
    const { variantId } = await pendingOrder();
    const event = succeeded({}, 'evt_twice');
    await deliver(event);
    const again = await deliver(event);
    expect(again.status).toBe(200);
    expect(bodyOf<{ data: { duplicate: boolean } }>(again).data.duplicate).toBe(true);
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
    expect(await db.select().from(orderStatusHistory)).toHaveLength(2);
  });

  it('applies two simultaneous deliveries of one event once', async () => {
    const { variantId } = await pendingOrder();
    const event = succeeded({}, 'evt_race');
    const [a, b] = await Promise.all([deliver(event), deliver(event)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
  });

  it('does not double-count when two different events report the same payment', async () => {
    const { variantId } = await pendingOrder();
    await deliver(succeeded({}, 'evt_a'));
    await deliver(succeeded({}, 'evt_b'));
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
  });

  it('refuses to mark paid when the amount received differs, and says so', async () => {
    const { variantId } = await pendingOrder();
    const res = await deliver(succeeded({ amount_received: 1 }));
    expect(res.status).toBe(200);
    expect((await theOrder()).status).toBe('pending_payment');
    expect((await thePayment()).status).toBe('requires_payment');
    expect((await thePayment()).lastError).toMatch(
      /Amount mismatch: received 1 eur, expected 2324 EUR/,
    );
    // Nothing shipped, nothing released: a human decides.
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 2 });
    expect((await db.select().from(carts))[0]?.status).toBe('active');
    const note = (await db.select().from(orderStatusHistory)).find((h) => h.note);
    expect(note?.note).toMatch(/mismatch/i);
  });

  it('refuses to mark paid when the currency differs', async () => {
    await pendingOrder();
    await deliver(succeeded({ currency: 'usd' }));
    expect((await theOrder()).status).toBe('pending_payment');
  });

  it('acknowledges an intent we never created without changing anything', async () => {
    await pendingOrder();
    const res = await deliver(succeeded({ id: 'pi_someone_else' }));
    expect(res.status).toBe(200);
    expect((await theOrder()).status).toBe('pending_payment');
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });

  it('flags money received for an order that was already cancelled, and keeps it cancelled', async () => {
    const { variantId } = await pendingOrder();
    await deliver(eventOf('payment_intent.canceled', intentObject()));
    await deliver(succeeded());
    expect((await theOrder()).status).toBe('cancelled');
    expect(await thePayment()).toMatchObject({ status: 'succeeded' });
    expect((await thePayment()).lastError).toMatch(/refund needed/);
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });
});

describe('payment_intent.payment_failed', () => {
  it('records the failure but keeps the order and its stock so the customer can retry', async () => {
    const { variantId } = await pendingOrder();
    await deliver(
      eventOf(
        'payment_intent.payment_failed',
        intentObject({ last_payment_error: { message: 'Your card was declined.' } }),
      ),
    );
    expect(await thePayment()).toMatchObject({
      status: 'failed',
      lastError: 'Your card was declined.',
    });
    expect((await theOrder()).status).toBe('pending_payment');
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 2 });

    // The retry succeeds on the same intent.
    await deliver(succeeded());
    expect((await theOrder()).status).toBe('paid');
    expect(await thePayment()).toMatchObject({ status: 'succeeded', lastError: null });
  });

  it('does not undo a success when a late failure event arrives out of order', async () => {
    await pendingOrder();
    await deliver(succeeded());
    await deliver(eventOf('payment_intent.payment_failed', intentObject()));
    expect((await thePayment()).status).toBe('succeeded');
    expect((await theOrder()).status).toBe('paid');
  });
});

describe('payment_intent.canceled', () => {
  it('cancels the order and releases its stock', async () => {
    const { variantId } = await pendingOrder();
    await deliver(eventOf('payment_intent.canceled', intentObject()));
    expect((await theOrder()).status).toBe('cancelled');
    expect(await thePayment()).toMatchObject({ status: 'failed' });
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });

  it('never cancels an order that is already paid', async () => {
    const { variantId } = await pendingOrder();
    await deliver(succeeded());
    await deliver(eventOf('payment_intent.canceled', intentObject()));
    expect((await theOrder()).status).toBe('paid');
    expect(await stockOf(variantId)).toEqual({ quantity: 8, reserved: 0 });
  });

  it('releases only once when delivered twice under different event ids', async () => {
    const { variantId } = await pendingOrder();
    await deliver(eventOf('payment_intent.canceled', intentObject()));
    await deliver(eventOf('payment_intent.canceled', intentObject()));
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 0 });
  });
});

describe('charge.refunded', () => {
  const charge = (refunded: boolean) => ({
    id: 'ch_1',
    object: 'charge',
    payment_intent: 'pi_fake_1',
    refunded,
  });

  it('marks a fully refunded paid order and its payment refunded', async () => {
    await pendingOrder();
    await deliver(succeeded());
    await deliver(eventOf('charge.refunded', charge(true)));
    expect((await theOrder()).status).toBe('refunded');
    expect((await thePayment()).status).toBe('refunded');
    const history = await db.select().from(orderStatusHistory);
    expect(history.find((h) => h.toStatus === 'refunded')).toMatchObject({ fromStatus: 'paid' });
  });

  it('ignores a partial refund', async () => {
    await pendingOrder();
    await deliver(succeeded());
    await deliver(eventOf('charge.refunded', charge(false)));
    expect((await theOrder()).status).toBe('paid');
  });

  it('ignores a refund for an order that was never paid', async () => {
    await pendingOrder();
    await deliver(eventOf('charge.refunded', charge(true)));
    expect((await theOrder()).status).toBe('pending_payment');
  });
});

describe('other events and failures', () => {
  it('stores and acknowledges event types it does not handle', async () => {
    const res = await deliver(eventOf('customer.created', { id: 'cus_1' }, 'evt_other'));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(webhookEvents);
    expect(row).toMatchObject({ id: 'evt_other', type: 'customer.created', error: null });
    expect(row?.processedAt).toBeInstanceOf(Date);
  });

  it('answers 500 and keeps the failure when handling throws, then processes the redelivery', async () => {
    await pendingOrder();
    // Malformed object (no id): the handler throws, so Stripe must be told to retry.
    const broken = eventOf('payment_intent.succeeded', { object: 'payment_intent' }, 'evt_retry');
    const failed = await deliver(broken);
    expect(failed.status).toBe(500);
    const [row] = await db.select().from(webhookEvents);
    expect(row?.processedAt).toBeNull();
    expect(row?.error).toBeTruthy();
    expect((await theOrder()).status).toBe('pending_payment');

    // The redelivery of the same event id (now well-formed) is processed, not skipped as seen.
    const fixed = await deliver(succeeded({}, 'evt_retry'));
    expect(fixed.status).toBe(200);
    expect((await theOrder()).status).toBe('paid');
    const [after] = await db.select().from(webhookEvents);
    expect(after?.processedAt).toBeInstanceOf(Date);
    expect(after?.error).toBeNull();
  });

  it('answers 502 for every webhook when no webhook secret is configured', async () => {
    const noSecret = makeTestApp({
      payments: createStripeGateway({ secretKey: 'sk_test_offline_never_used' }),
    });
    const res = await request(noSecret)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=abc')
      .send('{}');
    expect(res.status).toBe(502);
  });
});
