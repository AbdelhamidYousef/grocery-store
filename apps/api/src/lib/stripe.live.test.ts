import { randomUUID } from 'node:crypto';

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
    email: 'test@pawsome.test',
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

  it('maps an unknown intent to a 502 provider error', async () => {
    await expect(gateway().retrievePaymentIntent('pi_does_not_exist')).rejects.toMatchObject({
      status: 502,
    });
  });
});
