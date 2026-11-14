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
  it('writes the newsletter confirmation in French for a subscriber on /fr-fr', async () => {
    const res = await makeShopper(app, undefined, 'fr-fr').call('post', '/newsletter/subscribe', {
      email: 'claire@pawsome.test',
      consent: true,
      pets: [],
    });
    expect(res.status).toBe(202);
    await outbox.drain();
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.subject).toBe('Confirmez votre abonnement Pawsome');
    expect(transport.sent[0]?.html).toContain('<html lang="fr">');
  });

  it('writes the contact acknowledgement in German but the shop notification in English', async () => {
    const res = await makeShopper(app, undefined, 'de-de').call('post', '/contact', {
      name: 'Hanna',
      email: 'hanna@pawsome.test',
      topic: 'order',
      message: 'Wo ist mein Paket? Es sollte am Montag kommen.',
    });
    expect(res.status).toBe(201);
    await outbox.drain();
    const toCustomer = transport.sent.find((m) => m.to === 'hanna@pawsome.test');
    expect(toCustomer?.subject).toMatch(/^Wir haben Ihre Nachricht erhalten/);
    expect(toCustomer?.text).toContain('Thema: Meine Bestellung');
    const toShop = transport.sent.find((m) => m.to !== 'hanna@pawsome.test');
    expect(toShop?.subject).toMatch(/^\[Contact\] My order from Hanna/);
  });

  it('falls back to English with no store view', async () => {
    await makeShopper(app).call('post', '/newsletter/subscribe', {
      email: 'eve@pawsome.test',
      consent: true,
      pets: [],
    });
    await outbox.drain();
    expect(transport.sent[0]?.subject).toBe('Confirm your Pawsome subscription');
  });
});
