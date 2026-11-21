import { randomUUID } from 'node:crypto';

import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { env } from '../config/env.ts';

import { createStripeGateway } from './stripe.ts';

// Talks to the real Stripe TEST API (no money moves; sk_test_ is enforced by the env schema).
// Skipped, loudly, when no key is configured: a green run without these tests must never be
// mistaken for a run that exercised Stripe. The order/stock/idempotency logic is covered by
// FakeStripe tests and webhook signatures by offline tests; only the SDK-to-Stripe wiring is here.
const key = env.STRIPE_SECRET_KEY;
if (!key) {
  console.warn(
    '\n!!! STRIPE LIVE TESTS SKIPPED: STRIPE_SECRET_KEY is not set (add an sk_test_ key to .env). !!!\n' +
      '!!! The real Stripe test API was NOT exercised in this run. !!!\n',
  );
}

describe.skipIf(!key)('real Stripe test API', () => {
  // Built per test: vitest still runs this block when the suite is skipped, and the SDK refuses an
  // empty key.
  const gateway = () => createStripeGateway({ secretKey: key ?? '' });
  const input = () => ({
    amountCents: 1234,
    currency: 'EUR',
    orderId: randomUUID(),
    orderNumber: 'PW-2026-000001',
    email: 'test@grocery.test',
    idempotencyKey: `live-test:${randomUUID()}`,
  });

  it('creates an intent, returns the same one for a repeated idempotency key, then cancels it', async () => {
    const request = input();
    const first = await gateway().createPaymentIntent(request);
    const second = await gateway().createPaymentIntent(request);
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({ amountCents: 1234, currency: 'eur' });
    expect(first.clientSecret).toMatch(/_secret_/);

    const updated = await gateway().updatePaymentIntentAmount(first.id, 2000);
    expect(updated.amountCents).toBe(2000);
    expect((await gateway().retrievePaymentIntent(first.id)).amountCents).toBe(2000);

    expect((await gateway().cancelPaymentIntent(first.id)).status).toBe('canceled');
    // Cancelling twice reports the state instead of failing.
    expect((await gateway().cancelPaymentIntent(first.id)).status).toBe('canceled');
  });

  // Manual capture end to end (G6): authorise with the test card, capture LESS than the hold, see that a
  // second capture with the same key takes nothing more and that a higher amount is refused.
  it('authorises with a test card, captures less than the hold once, and refuses a higher amount', async () => {
    const stripe = new Stripe(key ?? '');
    const request = { ...input(), amountCents: 2000, captureMethod: 'manual' as const };
    const created = await gateway().createPaymentIntent(request);
    const confirmed = await stripe.paymentIntents.confirm(created.id, {
      payment_method: 'pm_card_visa',
      return_url: 'https://example.test/return',
    });
    expect(confirmed.status).toBe('requires_capture');
    const held = await gateway().retrievePaymentIntent(created.id);
    expect(held).toMatchObject({ status: 'requires_capture', amountCapturableCents: 2000 });

    await expect(
      gateway().capturePaymentIntent(created.id, 2001, `${request.idempotencyKey}:high`),
    ).rejects.toMatchObject({ status: 502 });

    const captureKey = `${request.idempotencyKey}:capture`;
    const captured = await gateway().capturePaymentIntent(created.id, 1800, captureKey);
    expect(captured).toMatchObject({ status: 'succeeded', amountReceivedCents: 1800 });
    // Same key: the first answer, nothing taken twice.
    const again = await gateway().capturePaymentIntent(created.id, 1800, captureKey);
    expect(again).toMatchObject({ status: 'succeeded', amountReceivedCents: 1800 });
  });

  it('maps an unknown intent to a 502 provider error', async () => {
    await expect(gateway().retrievePaymentIntent('pi_does_not_exist')).rejects.toMatchObject({
      status: 502,
    });
  });
});
