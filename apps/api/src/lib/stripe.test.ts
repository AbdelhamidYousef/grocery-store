import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { AppError } from './errors.ts';
import {
  createStripeGateway,
  createUnconfiguredGateway,
  STRIPE_API_VERSION,
  WebhookSignatureError,
} from './stripe.ts';

// Real verification code, no network: the SDK signs a payload with a test secret and the gateway
// verifies it. (The key below is never sent anywhere in these tests.)
const WEBHOOK_SECRET = 'whsec_test_offline_secret_for_unit_tests';
const gateway = createStripeGateway({
  secretKey: 'sk_test_offline_never_used',
  webhookSecret: WEBHOOK_SECRET,
});
const signer = new Stripe('sk_test_offline_never_used');

const event = {
  id: 'evt_1',
  object: 'event',
  type: 'payment_intent.succeeded',
  data: { object: {} },
};
const body = JSON.stringify(event);
const sign = (payload: string, secret = WEBHOOK_SECRET, timestamp?: number) =>
  signer.webhooks.generateTestHeaderString({
    payload,
    secret,
    ...(timestamp !== undefined && { timestamp }),
  });

describe('constructWebhookEvent', () => {
  it('returns the event for a correctly signed body', () => {
    const parsed = gateway.constructWebhookEvent(Buffer.from(body), sign(body));
    expect(parsed).toMatchObject({ id: 'evt_1', type: 'payment_intent.succeeded' });
  });

  it('rejects a body that was altered after signing', () => {
    const header = sign(body);
    const tampered = body.replace('evt_1', 'evt_2');
    expect(() => gateway.constructWebhookEvent(Buffer.from(tampered), header)).toThrow(
      WebhookSignatureError,
    );
  });

  it('rejects a signature made with another secret', () => {
    expect(() =>
      gateway.constructWebhookEvent(Buffer.from(body), sign(body, 'whsec_someone_elses_secret')),
    ).toThrow(WebhookSignatureError);
  });

  it('rejects a missing or garbage signature header', () => {
    expect(() => gateway.constructWebhookEvent(Buffer.from(body), undefined)).toThrow(
      WebhookSignatureError,
    );
    expect(() => gateway.constructWebhookEvent(Buffer.from(body), 'nonsense')).toThrow(
      WebhookSignatureError,
    );
  });

  it('rejects a validly signed but stale delivery (replay protection)', () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    expect(() =>
      gateway.constructWebhookEvent(Buffer.from(body), sign(body, WEBHOOK_SECRET, tenMinutesAgo)),
    ).toThrow(WebhookSignatureError);
  });

  it('refuses everything (as a 502) when no webhook secret is configured', () => {
    const noSecret = createStripeGateway({ secretKey: 'sk_test_offline_never_used' });
    expect(() => noSecret.constructWebhookEvent(Buffer.from(body), sign(body))).toThrow(AppError);
  });
});

describe('pinned API version', () => {
  it('matches the version the installed SDK was generated for', () => {
    // A mismatch would mean someone upgraded the SDK without re-reading its changelog.
    expect(STRIPE_API_VERSION).toBe(Stripe.API_VERSION);
  });
});

describe('createUnconfiguredGateway', () => {
  it('rejects every operation with a 502 payment provider error', async () => {
    const g = createUnconfiguredGateway();
    await expect(g.retrievePaymentIntent('pi_1')).rejects.toMatchObject({
      status: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
    });
    expect(() => g.constructWebhookEvent(Buffer.from('{}'), 'x')).toThrow(/not configured/);
  });
});
