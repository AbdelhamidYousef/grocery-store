import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orders, withdrawalRequests } from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createShippingMethods } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { placeOrder, simulate } from '../../test/orders.ts';
import { createOutbox } from '../mail/outbox.ts';

let transport: MemoryTransport;
let outbox: ReturnType<typeof createOutbox>;
let app: ReturnType<typeof makeTestApp>;

beforeEach(async () => {
  transport = new MemoryTransport();
  outbox = createOutbox({ transport, log: pino({ level: 'silent' }) });
  app = makeTestApp({ outbox });
  await createShippingMethods();
});

const withdraw = (body: object, a = app) =>
  request(a).post('/api/v1/withdrawals').set('Origin', TEST_ORIGIN).send(body);

async function paidOrder(email = 'ada@pawsome.test') {
  const { number } = await placeOrder(app, { email });
  await simulate(app, number);
  return number;
}

describe('POST /withdrawals', () => {
  it('stores the request and sends a timestamped acknowledgement', async () => {
    const number = await paidOrder();
    const res = await withdraw({
      orderNumber: number,
      email: 'ADA@pawsome.test',
      itemsText: 'the red rope',
      reason: 'Changed my mind',
    });
    expect(res.status).toBe(201);
    const { data } = bodyOf<{ data: { reference: string; requestedAt: string } }>(res);
    expect(data.reference).toMatch(/^WD-[0-9A-F]{8}$/);

    const rows = await db.select().from(withdrawalRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'new',
      itemsText: 'the red rope',
      email: 'ada@pawsome.test',
    });

    await outbox.drain();
    const mail = transport.sent.find((m) => m.subject.includes('withdrawal'));
    expect(mail?.to).toBe('ada@pawsome.test');
    expect(mail?.text).toContain(data.reference);
    expect(mail?.text).toContain('the red rope');
    // The timestamp is written in the email body (the durable-medium proof).
    expect(mail?.text).toMatch(/on \d{1,2} \w+ \d{4}/);
  });

  it('answers a wrong email and an unknown order with the same 404 and stores nothing', async () => {
    const number = await paidOrder();
    const wrong = await withdraw({ orderNumber: number, email: 'mallory@pawsome.test' });
    const unknown = await withdraw({ orderNumber: 'PW-2026-999999', email: 'ada@pawsome.test' });
    expect(wrong.status).toBe(404);
    expect(wrong.body).toEqual(unknown.body);
    expect(await db.select().from(withdrawalRequests)).toHaveLength(0);
  });

  it('refuses an order that was never paid', async () => {
    const { number } = await placeOrder(app, { email: 'ada@pawsome.test' });
    const res = await withdraw({ orderNumber: number, email: 'ada@pawsome.test' });
    expect(res.status).toBe(409);
    expect(await db.select().from(withdrawalRequests)).toHaveLength(0);
  });

  it('allows a second request for the same order, each with its own email', async () => {
    const number = await paidOrder();
    await withdraw({ orderNumber: number, email: 'ada@pawsome.test', itemsText: 'one' });
    await withdraw({ orderNumber: number, email: 'ada@pawsome.test', itemsText: 'two' });
    await outbox.drain();
    expect(transport.sent.filter((m) => m.subject.includes('withdrawal'))).toHaveLength(2);
  });

  it('rejects over-long text and is rate limited', async () => {
    expect(
      (await withdraw({ orderNumber: 'x', email: 'y', reason: 'z'.repeat(1001) })).status,
    ).toBe(400);
    const limited = makeTestApp({
      outbox,
      config: { lookupRateLimit: { windowMs: 60_000, limit: 1 } },
    });
    await withdraw({ orderNumber: 'x', email: 'y' }, limited);
    expect((await withdraw({ orderNumber: 'x', email: 'y' }, limited)).status).toBe(429);
  });

  it('keeps the order untouched', async () => {
    const number = await paidOrder();
    await withdraw({ orderNumber: number, email: 'ada@pawsome.test' });
    const [order] = await db.select().from(orders).where(eq(orders.number, number));
    // Withdrawal is a request for an admin to act on; it never changes the order by itself.
    expect(order?.status).toBe('paid');
  });
});
