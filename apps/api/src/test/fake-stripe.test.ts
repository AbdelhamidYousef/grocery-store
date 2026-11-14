import { describe, expect, it } from 'vitest';

import { FakeStripe } from './fake-stripe.ts';

async function paidIntent(fake: FakeStripe, amountCents = 1000) {
  const pi = await fake.createPaymentIntent({
    amountCents,
    currency: 'EUR',
    orderId: 'o',
    orderNumber: 'PW-1',
    email: 'a@b.test',
    idempotencyKey: `k-${amountCents}`,
  });
  fake.setStatus(pi.id, 'succeeded');
  return pi.id;
}

describe('FakeStripe partial refunds', () => {
  it('refunds part of a charge, then the remainder without an amount', async () => {
    const fake = new FakeStripe();
    const id = await paidIntent(fake);
    await fake.refundPaymentIntent(id, 'return-1', 400);
    expect(fake.refundedCents(id)).toBe(400);
    await fake.refundPaymentIntent(id, 'refund:rest');
    expect(fake.refundedCents(id)).toBe(1000);
  });

  it('rejects a refund above what is left, and a zero or negative one', async () => {
    const fake = new FakeStripe();
    const id = await paidIntent(fake);
    await fake.refundPaymentIntent(id, 'a', 700);
    await expect(fake.refundPaymentIntent(id, 'b', 301)).rejects.toMatchObject({ status: 502 });
    await expect(fake.refundPaymentIntent(id, 'c', 0)).rejects.toMatchObject({ status: 502 });
    expect(fake.refundedCents(id)).toBe(700);
  });

  it('answers a replayed key with the first refund and moves no money twice', async () => {
    const fake = new FakeStripe();
    const id = await paidIntent(fake);
    const first = await fake.refundPaymentIntent(id, 'return-9', 250);
    const again = await fake.refundPaymentIntent(id, 'return-9', 250);
    expect(again).toEqual(first);
    expect(fake.refundedCents(id)).toBe(250);
  });

  it('treats a full refund of an already fully refunded intent as done', async () => {
    const fake = new FakeStripe();
    const id = await paidIntent(fake);
    await fake.refundPaymentIntent(id, 'x');
    expect(await fake.refundPaymentIntent(id, 'y')).toEqual({
      id: 'already_refunded',
      status: 'succeeded',
    });
  });
});
