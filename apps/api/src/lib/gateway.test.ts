import { describe, expect, it } from 'vitest';

import { FakeStripe } from '../test/fake-stripe.ts';

import { selectPaymentGateway } from './gateway.ts';

describe('selectPaymentGateway', () => {
  it('uses the real Stripe client whenever a key is set, even under NODE_ENV=test', async () => {
    const test = await selectPaymentGateway({ NODE_ENV: 'test', STRIPE_SECRET_KEY: 'sk_test_x' });
    expect(test.kind).toBe('stripe');
    expect(test.gateway).not.toBeInstanceOf(FakeStripe);
    const dev = await selectPaymentGateway({
      NODE_ENV: 'development',
      STRIPE_SECRET_KEY: 'sk_test_x',
    });
    expect(dev.kind).toBe('stripe');
  });

  it('boots the fake gateway only under NODE_ENV=test without a key', async () => {
    const picked = await selectPaymentGateway({ NODE_ENV: 'test' });
    expect(picked.kind).toBe('fake');
    expect(picked.gateway).toBeInstanceOf(FakeStripe);
    // An empty variable (`STRIPE_SECRET_KEY=` in a fresh .env) counts as absent.
    expect((await selectPaymentGateway({ NODE_ENV: 'test', STRIPE_SECRET_KEY: '' })).kind).toBe(
      'fake',
    );
  });

  it('gives every boot its own intent ids, because the database outlives the process', async () => {
    const input = {
      amountCents: 100,
      currency: 'eur',
      orderId: 'o',
      orderNumber: 'PW-2026-000001',
      email: 'a@b.test',
      idempotencyKey: 'k',
    };
    const first = await (
      await selectPaymentGateway({ NODE_ENV: 'test' })
    ).gateway.createPaymentIntent(input);
    const second = await (
      await selectPaymentGateway({ NODE_ENV: 'test' })
    ).gateway.createPaymentIntent(input);
    expect(first.id).not.toBe(second.id);
  });

  it.each(['development', 'production'] as const)(
    'never gives the fake to %s: no key means "not configured"',
    async (NODE_ENV) => {
      const picked = await selectPaymentGateway({ NODE_ENV });
      expect(picked.kind).toBe('unconfigured');
      expect(picked.gateway).not.toBeInstanceOf(FakeStripe);
      await expect(
        picked.gateway.createPaymentIntent({
          amountCents: 100,
          currency: 'eur',
          orderId: 'o',
          orderNumber: 'PW-2026-000001',
          email: 'a@b.test',
          idempotencyKey: 'k',
        }),
      ).rejects.toMatchObject({ status: 502 });
    },
  );
});
