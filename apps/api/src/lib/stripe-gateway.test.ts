import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStripeGateway } from './stripe.ts';

// The real gateway wraps the SDK; the SDK is replaced here by spies so every wrapper (field
// mapping, the 502 translation, the two "already done" answers) runs without a network. The live
// test against Stripe's test API (stripe.live.test.ts) covers the real wire format when a key
// exists; this file covers our logic around it on every run.
const sdk = vi.hoisted(() => {
  class StripeError extends Error {
    code: string | undefined;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    StripeError,
    paymentIntents: {
      create: vi.fn(),
      update: vi.fn(),
      retrieve: vi.fn(),
      cancel: vi.fn(),
      capture: vi.fn(),
    },
    refunds: { create: vi.fn(), list: vi.fn() },
  };
});

vi.mock('stripe', () => {
  class FakeStripe {
    static errors = { StripeError: sdk.StripeError };
    static API_VERSION = '2026-10-28.endive';
    paymentIntents = sdk.paymentIntents;
    refunds = sdk.refunds;
    webhooks = { constructEvent: vi.fn() };
  }
  return { default: FakeStripe };
});

const pi = (over: Partial<Stripe.PaymentIntent> = {}) =>
  ({
    id: 'pi_1',
    status: 'requires_payment_method',
    amount: 1234,
    amount_received: 0,
    amount_capturable: 0,
    currency: 'eur',
    client_secret: 'pi_1_secret',
    ...over,
  }) as Stripe.PaymentIntent;

const gateway = createStripeGateway({ secretKey: 'sk_test_x' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createPaymentIntent', () => {
  it('sends lower-case currency, metadata and the idempotency key, and maps the answer', async () => {
    sdk.paymentIntents.create.mockResolvedValue(pi());
    const info = await gateway.createPaymentIntent({
      amountCents: 1234,
      currency: 'EUR',
      orderId: 'o-1',
      orderNumber: 'PAW-1',
      email: 'ada@grocery.test',
      idempotencyKey: 'order-o-1',
    });
    expect(info).toEqual({
      id: 'pi_1',
      status: 'requires_payment_method',
      amountCents: 1234,
      amountReceivedCents: 0,
      amountCapturableCents: 0,
      currency: 'eur',
      clientSecret: 'pi_1_secret',
    });
    expect(sdk.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1234,
        currency: 'eur',
        metadata: { orderId: 'o-1', orderNumber: 'PAW-1' },
      }),
      { idempotencyKey: 'order-o-1' },
    );
  });

  it('asks Stripe to only authorise when capture is manual, and charges at once otherwise', async () => {
    sdk.paymentIntents.create.mockResolvedValue(pi());
    const base = {
      amountCents: 1234,
      currency: 'EUR',
      orderId: 'o-1',
      orderNumber: 'GR-1',
      email: 'ada@grocery.test',
    };
    await gateway.createPaymentIntent({ ...base, idempotencyKey: 'k1', captureMethod: 'manual' });
    await gateway.createPaymentIntent({ ...base, idempotencyKey: 'k2' });
    expect(sdk.paymentIntents.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ capture_method: 'manual' }),
      { idempotencyKey: 'k1' },
    );
    expect(sdk.paymentIntents.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ capture_method: 'automatic' }),
      { idempotencyKey: 'k2' },
    );
  });

  it('turns any SDK failure into a 502 payment provider error that keeps the cause', async () => {
    const cause = new Error('socket hang up');
    sdk.paymentIntents.create.mockRejectedValue(cause);
    await expect(
      gateway.createPaymentIntent({
        amountCents: 1,
        currency: 'eur',
        orderId: 'o',
        orderNumber: 'n',
        email: 'e@x.test',
        idempotencyKey: 'k',
      }),
    ).rejects.toMatchObject({ status: 502, code: 'PAYMENT_PROVIDER_ERROR', cause });
  });
});

describe('update and retrieve', () => {
  it('updates only the amount', async () => {
    sdk.paymentIntents.update.mockResolvedValue(pi({ amount: 999 }));
    expect((await gateway.updatePaymentIntentAmount('pi_1', 999)).amountCents).toBe(999);
    expect(sdk.paymentIntents.update).toHaveBeenCalledWith('pi_1', { amount: 999 });
  });

  it('retrieves by id and reports a provider failure as 502', async () => {
    sdk.paymentIntents.retrieve.mockResolvedValueOnce(pi({ status: 'succeeded' }));
    expect((await gateway.retrievePaymentIntent('pi_1')).status).toBe('succeeded');
    sdk.paymentIntents.retrieve.mockRejectedValueOnce(new Error('boom'));
    await expect(gateway.retrievePaymentIntent('pi_1')).rejects.toMatchObject({ status: 502 });
  });
});

describe('capturePaymentIntent', () => {
  it('captures the given amount with the idempotency key and maps what Stripe took', async () => {
    sdk.paymentIntents.capture.mockResolvedValue(
      pi({ status: 'succeeded', amount_received: 1100, amount_capturable: 0 }),
    );
    const info = await gateway.capturePaymentIntent('pi_1', 1100, 'capture:o-1');
    expect(info).toMatchObject({ status: 'succeeded', amountReceivedCents: 1100 });
    expect(sdk.paymentIntents.capture).toHaveBeenCalledWith(
      'pi_1',
      { amount_to_capture: 1100 },
      { idempotencyKey: 'capture:o-1' },
    );
  });

  it('reports a refusal (more than authorised, not capturable) as a 502', async () => {
    sdk.paymentIntents.capture.mockRejectedValue(
      new sdk.StripeError('too much', 'amount_too_large'),
    );
    await expect(gateway.capturePaymentIntent('pi_1', 99_999, 'k')).rejects.toMatchObject({
      status: 502,
    });
  });
});

describe('cancelPaymentIntent', () => {
  it('cancels a fresh intent', async () => {
    sdk.paymentIntents.cancel.mockResolvedValue(pi({ status: 'canceled' }));
    expect((await gateway.cancelPaymentIntent('pi_1')).status).toBe('canceled');
  });

  it('answers with the real state when the intent is already in a final state', async () => {
    sdk.paymentIntents.cancel.mockRejectedValue(
      new sdk.StripeError('already', 'payment_intent_unexpected_state'),
    );
    sdk.paymentIntents.retrieve.mockResolvedValue(pi({ status: 'succeeded' }));
    expect((await gateway.cancelPaymentIntent('pi_1')).status).toBe('succeeded');
  });

  it('still fails (502) on any other Stripe error', async () => {
    sdk.paymentIntents.cancel.mockRejectedValue(new sdk.StripeError('nope', 'api_error'));
    await expect(gateway.cancelPaymentIntent('pi_1')).rejects.toMatchObject({ status: 502 });
  });
});

describe('refundPaymentIntent', () => {
  it('refunds the whole intent with the idempotency key', async () => {
    sdk.refunds.create.mockResolvedValue({ id: 're_1', status: 'succeeded' });
    expect(await gateway.refundPaymentIntent('pi_1', 'refund-1')).toEqual({
      id: 're_1',
      status: 'succeeded',
    });
    expect(sdk.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_1' },
      { idempotencyKey: 'refund-1' },
    );
  });

  it('sends the amount for a partial refund (in cents) and nothing extra for a full one', async () => {
    sdk.refunds.create.mockResolvedValue({ id: 're_3', status: 'succeeded' });
    await gateway.refundPaymentIntent('pi_1', 'return-1', 450);
    expect(sdk.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_1', amount: 450 },
      { idempotencyKey: 'return-1' },
    );
  });

  it('attaches metadata to the refund so it can be found after the key expires', async () => {
    sdk.refunds.create.mockResolvedValue({ id: 're_4', status: 'succeeded' });
    await gateway.refundPaymentIntent('pi_1', 'return-1', 450, { return_id: 'r1' });
    expect(sdk.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_1', amount: 450, metadata: { return_id: 'r1' } },
      { idempotencyKey: 'return-1' },
    );
  });

  it('lists the refunds of an intent with their metadata', async () => {
    sdk.refunds.list.mockResolvedValue({
      data: [{ id: 're_9', status: 'succeeded', amount: 450, metadata: { return_id: 'r1' } }],
    });
    expect(await gateway.listRefunds('pi_1')).toEqual([
      { id: 're_9', status: 'succeeded', amountCents: 450, metadata: { return_id: 'r1' } },
    ]);
    expect(sdk.refunds.list).toHaveBeenCalledWith({ payment_intent: 'pi_1', limit: 100 });
  });

  it('reports pending when Stripe leaves the status out', async () => {
    sdk.refunds.create.mockResolvedValue({ id: 're_2', status: null });
    expect((await gateway.refundPaymentIntent('pi_1', 'k')).status).toBe('pending');
  });

  it('treats an already refunded charge as done', async () => {
    sdk.refunds.create.mockRejectedValue(new sdk.StripeError('done', 'charge_already_refunded'));
    expect(await gateway.refundPaymentIntent('pi_1', 'k')).toEqual({
      id: 'already_refunded',
      status: 'succeeded',
    });
  });

  it('fails (502) on any other error', async () => {
    sdk.refunds.create.mockRejectedValue(new Error('network'));
    await expect(gateway.refundPaymentIntent('pi_1', 'k')).rejects.toMatchObject({ status: 502 });
  });
});
