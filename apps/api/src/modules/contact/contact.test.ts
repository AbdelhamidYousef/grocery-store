import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { env } from '../../config/env.ts';
import { db } from '../../db/client.ts';
import { contactMessages, emailOutbox } from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { bodyOf } from '../../test/http.ts';
import { createOutbox } from '../mail/outbox.ts';

let transport: MemoryTransport;
let outbox: ReturnType<typeof createOutbox>;
let app: ReturnType<typeof makeTestApp>;

beforeEach(() => {
  transport = new MemoryTransport();
  outbox = createOutbox({ transport, log: pino({ level: 'silent' }) });
  app = makeTestApp({ outbox });
});

const valid = {
  name: 'Ada',
  email: 'ada@grocery.test',
  topic: 'order',
  orderNumber: 'PW-2026-000001',
  message: 'Where is my parcel? It was due on Monday.',
};
const send = (body: object, a = app) =>
  request(a).post('/api/v1/contact').set('Origin', TEST_ORIGIN).send(body);

describe('POST /contact', () => {
  it('stores the message and emails the customer and the shop', async () => {
    const res = await send(valid);
    expect(res.status).toBe(201);
    const reference = bodyOf<{ data: { reference: string } }>(res).data.reference;
    expect(reference).toMatch(/^MSG-[0-9A-F]{8}$/);

    const rows = await db.select().from(contactMessages);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      topic: 'order',
      handledAt: null,
      orderNumber: 'PW-2026-000001',
    });

    await outbox.drain();
    const toCustomer = transport.sent.find((m) => m.to === 'ada@grocery.test');
    const toShop = transport.sent.find((m) => m.to === env.SHOP_INBOX_EMAIL);
    expect(toCustomer?.subject).toContain(reference);
    expect(toCustomer?.text).toContain('Where is my parcel?');
    expect(toShop?.subject).toContain('Ada');
    expect(toShop?.text).toContain('ada@grocery.test');
  });

  it('escapes the visitor text in the HTML of both emails', async () => {
    await send({ ...valid, name: '<b>Ada</b>', message: '<script>alert(1)</script> hello there' });
    await outbox.drain();
    for (const mail of transport.sent) {
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).toContain('&lt;script&gt;');
    }
  });

  it('pretends success for a bot that fills the honeypot, and stores and sends nothing', async () => {
    const res = await send({ ...valid, website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(await db.select().from(contactMessages)).toHaveLength(0);
    expect(await db.select().from(emailOutbox)).toHaveLength(0);
  });

  it.each([
    ['a short message', { message: 'hi' }],
    ['a bad email', { email: 'not-an-email' }],
    ['an unknown topic', { topic: 'weather' }],
    ['no name', { name: '   ' }],
    ['a huge message', { message: 'x'.repeat(2001) }],
  ])('rejects %s', async (_what, patch) => {
    expect((await send({ ...valid, ...patch })).status).toBe(400);
    expect(await db.select().from(contactMessages)).toHaveLength(0);
  });

  it('allows the order number to be left out', async () => {
    expect((await send({ ...valid, orderNumber: undefined })).status).toBe(201);
    const [row] = await db.select().from(contactMessages);
    expect(row?.orderNumber).toBeNull();
  });

  it('is limited to 5 messages per hour per IP', async () => {
    const limited = makeTestApp({
      outbox,
      config: { contactRateLimit: { windowMs: 60_000, limit: 5 } },
    });
    for (let i = 0; i < 5; i += 1) expect((await send(valid, limited)).status).toBe(201);
    expect((await send(valid, limited)).status).toBe(429);
  });
});
