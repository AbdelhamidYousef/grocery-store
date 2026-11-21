import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createShippingMethods } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { placeOrder, simulate, TEST_ADDRESS } from '../../test/orders.ts';

const app = makeTestApp();
const track = (body: object, a = app) =>
  request(a).post('/api/v1/orders/track').set('Origin', TEST_ORIGIN).send(body);

beforeEach(async () => {
  await createShippingMethods();
});

interface Tracked {
  data: {
    orderNumber: string;
    status: string;
    statusLabel: string;
    items: { name: string; quantity: number }[];
    timeline: { status: string; label: string; at: string }[];
    tracking: unknown;
  };
}

describe('POST /orders/track', () => {
  it('shows status, items and the timeline to someone who knows number and email', async () => {
    const { number } = await placeOrder(app, { email: 'ada@grocery.test', quantity: 2 });
    await simulate(app, number);
    const res = await track({ orderNumber: number, email: 'ada@grocery.test' });
    expect(res.status).toBe(200);
    const { data } = bodyOf<Tracked>(res);
    expect(data).toMatchObject({ orderNumber: number, status: 'paid', tracking: null });
    expect(data.statusLabel).toBe('Payment confirmed');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.quantity).toBe(2);
    expect(data.timeline.map((t) => t.status)).toEqual(['pending_payment', 'paid']);
    expect(data.timeline.every((t) => t.label.length > 0)).toBe(true);
  });

  it('shows the delivery window the order was promised, and nothing else about delivery', async () => {
    const { number } = await placeOrder(app, { email: 'ada@grocery.test' });
    const res = await track({ orderNumber: number, email: 'ada@grocery.test' });
    const { data } = bodyOf<{
      data: { delivery: { kind: string; from: string; to: string } | null };
    }>(res);
    expect(data.delivery).toMatchObject({ kind: 'slot' });
    expect(Date.parse(data.delivery!.to) - Date.parse(data.delivery!.from)).toBe(3_600_000);
    expect(JSON.stringify(data)).not.toContain('slotId');
  });

  it('compares the email without case and the number without case or spaces', async () => {
    const { number } = await placeOrder(app, { email: 'ada@grocery.test' });
    const res = await track({
      orderNumber: ` ${number.toLowerCase()} `,
      email: ' ADA@grocery.test ',
    });
    expect(res.status).toBe(200);
  });

  it('answers a wrong email and an unknown order with the identical 404', async () => {
    const { number } = await placeOrder(app, { email: 'ada@grocery.test' });
    const wrongEmail = await track({ orderNumber: number, email: 'mallory@grocery.test' });
    const unknown = await track({ orderNumber: 'PW-2026-999999', email: 'ada@grocery.test' });
    const garbage = await track({ orderNumber: 'not an order', email: 'not an email' });
    expect(wrongEmail.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(garbage.status).toBe(404);
    expect(wrongEmail.body).toEqual(unknown.body);
    expect(garbage.body).toEqual(unknown.body);
  });

  it('leaks no address, payment or money data', async () => {
    const { number } = await placeOrder(app, { email: 'ada@grocery.test' });
    await simulate(app, number);
    const res = await track({ orderNumber: number, email: 'ada@grocery.test' });
    const text = JSON.stringify(res.body);
    for (const secret of [
      TEST_ADDRESS.fullName,
      TEST_ADDRESS.line1,
      TEST_ADDRESS.postalCode,
      'pi_',
      'Cents',
      'ada@grocery.test',
      'admin:',
      'system:',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('requires both fields', async () => {
    expect((await track({ orderNumber: 'PW-2026-000001' })).status).toBe(400);
  });

  it('is rate limited per IP', async () => {
    const limited = makeTestApp({ config: { lookupRateLimit: { windowMs: 60_000, limit: 3 } } });
    const body = { orderNumber: 'PW-2026-000001', email: 'a@b.test' };
    for (let i = 0; i < 3; i += 1) expect((await track(body, limited)).status).toBe(404);
    const res = await track(body, limited);
    expect(res.status).toBe(429);
    expect(bodyOf<{ error: { code: string } }>(res).error.code).toBe('RATE_LIMITED');
  });
});
