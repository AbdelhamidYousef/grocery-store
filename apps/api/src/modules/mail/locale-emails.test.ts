import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { makeShopper } from '../../test/shopper.ts';

import { createOutbox } from './outbox.ts';

let transport: MemoryTransport;
let outbox: ReturnType<typeof createOutbox>;
let app: ReturnType<typeof makeTestApp>;

beforeEach(() => {
  transport = new MemoryTransport();
  outbox = createOutbox({ transport, log: pino({ level: 'silent' }) });
  app = makeTestApp({ outbox });
});

describe('emails without an order follow the store view the person used', () => {
  it('writes the contact acknowledgement in German but the shop notification in English', async () => {
    const res = await makeShopper(app, undefined, 'de-de').call('post', '/contact', {
      name: 'Hanna',
      email: 'hanna@grocery.test',
      topic: 'order',
      message: 'Wo ist mein Paket? Es sollte am Montag kommen.',
    });
    expect(res.status).toBe(201);
    await outbox.drain();
    const toCustomer = transport.sent.find((m) => m.to === 'hanna@grocery.test');
    expect(toCustomer?.subject).toMatch(/^Wir haben deine Nachricht erhalten/);
    expect(toCustomer?.text).toContain('Thema: Meine Bestellung');
    const toShop = transport.sent.find((m) => m.to !== 'hanna@grocery.test');
    expect(toShop?.subject).toMatch(/^\[Contact\] My order from Hanna/);
  });

  it('falls back to English with no store view', async () => {
    await makeShopper(app).call('post', '/newsletter/subscribe', {
      email: 'eve@grocery.test',
      consent: true,
      pets: [],
    });
    await outbox.drain();
    expect(transport.sent[0]?.subject).toBe('Confirm your Grocery subscription');
  });
});
