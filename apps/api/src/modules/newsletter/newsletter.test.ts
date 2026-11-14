import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { discountCodes, emailOutbox, newsletterSubscribers } from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { orderByNumber, signedIn, simulate, TEST_ADDRESS } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { createOutbox } from '../mail/outbox.ts';

let app: ReturnType<typeof makeTestApp>;
let transport: MemoryTransport;
let outbox: ReturnType<typeof createOutbox>;
beforeEach(async () => {
  transport = new MemoryTransport();
  outbox = createOutbox({ transport, log: pino({ level: 'silent' }) });
  app = makeTestApp({ outbox });
  await createShippingMethods();
});

const subscribe = (email: string, extra: object = {}) =>
  makeShopper(app).call('post', '/newsletter/subscribe', {
    email,
    pets: ['dog'],
    consent: true,
    ...extra,
  });

// The link in the newest mail to this address, read from the text body like a person would.
const linkIn = (to: string, kind: 'confirm' | 'unsubscribe'): string => {
  const mails = transport.sent.filter((m) => m.to === to);
  for (const m of mails.toReversed()) {
    const found = m.text.match(new RegExp(`https?://\\S+/newsletter/${kind}\\?token=\\S+`));
    if (found) return found[0];
  }
  throw new Error(`no ${kind} link sent to ${to}`);
};
const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;
const confirmWith = (token: string) =>
  makeShopper(app).call('post', '/newsletter/confirm', { token });
const codesFor = async () => db.select().from(discountCodes);

describe('subscribing', () => {
  it('stores a pending row and mails a confirmation link; no code yet', async () => {
    const res = await subscribe('Pat@Example.com');
    expect(res.status).toBe(202);
    expect(bodyOf(res)).toEqual({ data: { status: 'check_your_inbox' } });
    await outbox.drain();
    const [row] = await db.select().from(newsletterSubscribers);
    expect(row).toMatchObject({ email: 'pat@example.com', status: 'pending', pets: ['dog'] });
    expect(row!.consentText).toContain('unsubscribe');
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.subject).toMatch(/Confirm/);
    expect(await codesFor()).toHaveLength(0);
  });

  it('answers the same for a confirmed address and sends it nothing', async () => {
    await subscribe('pat@example.com');
    await outbox.drain();
    await confirmWith(tokenOf(linkIn('pat@example.com', 'confirm')));
    await outbox.drain();
    const before = transport.sent.length;
    const again = await subscribe('pat@example.com');
    await outbox.drain();
    expect(again.status).toBe(202);
    expect(bodyOf(again)).toEqual({ data: { status: 'check_your_inbox' } });
    expect(transport.sent).toHaveLength(before);
  });

  it('requires the consent box and ignores the honeypot', async () => {
    const res = await subscribe('pat@example.com', { consent: false });
    expect(res.status).toBe(400);
    const bot = await subscribe('bot@example.com', { website: 'http://spam' });
    expect(bot.status).toBe(202);
    expect(await db.select().from(newsletterSubscribers)).toHaveLength(0);
  });

  it('links the account when a signed-in customer subscribes', async () => {
    const c = await signedIn(app);
    await c.shopper.call('post', '/newsletter/subscribe', {
      email: c.user.email,
      consent: true,
      pets: [],
    });
    const [row] = await db.select().from(newsletterSubscribers);
    expect(row!.userId).toBe(c.user.id);
  });

  it('is rate limited per IP', async () => {
    const limited = makeTestApp({
      outbox,
      config: { newsletterRateLimit: { windowMs: 60_000, limit: 2 } },
    });
    const post = (email: string) =>
      makeShopper(limited).call('post', '/newsletter/subscribe', {
        email,
        consent: true,
        pets: [],
      });
    expect((await post('a@example.com')).status).toBe(202);
    expect((await post('b@example.com')).status).toBe(202);
    expect((await post('c@example.com')).status).toBe(429);
  });
});

describe('confirming', () => {
  it('mints one WELCOME code, mails it, and a second click is a no-op', async () => {
    await subscribe('pat@example.com');
    await outbox.drain();
    const token = tokenOf(linkIn('pat@example.com', 'confirm'));
    const first = await confirmWith(token);
    expect(bodyOf(first)).toEqual({ data: { status: 'confirmed' } });
    const second = await confirmWith(token);
    expect(bodyOf(second)).toEqual({ data: { status: 'already_confirmed' } });
    await outbox.drain();

    const codes = await codesFor();
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatchObject({
      kind: 'percent',
      value: 10,
      firstOrderOnly: true,
      maxUses: 1,
      ownerUserId: null,
    });
    expect(codes[0]!.code).toMatch(/^WELCOME-[A-Z0-9]{4}$/);
    const welcome = transport.sent.filter((m) => /Welcome/.test(m.subject));
    expect(welcome).toHaveLength(1);
    expect(welcome[0]!.text).toContain(codes[0]!.code);
    expect(welcome[0]!.text).toMatch(/newsletter\/unsubscribe\?token=/);
    const [sub] = await db.select().from(newsletterSubscribers);
    expect(sub!.status).toBe('confirmed');
  });

  it('refuses an expired link (410) and an unknown one (404); no code either way', async () => {
    await subscribe('pat@example.com');
    const token = tokenOf((await outbox.drain(), linkIn('pat@example.com', 'confirm')));
    await db.update(newsletterSubscribers).set({ tokenExpiresAt: new Date(Date.now() - 1000) });
    const expired = await confirmWith(token);
    expect(expired.status).toBe(410);
    expect(errorOf(expired).message).toContain('expired');
    expect((await confirmWith('x'.repeat(30))).status).toBe(404);
    expect(await codesFor()).toHaveLength(0);
  });

  it('subscribing again after the link expired sends a fresh working link', async () => {
    await subscribe('pat@example.com');
    await outbox.drain();
    await db.update(newsletterSubscribers).set({ tokenExpiresAt: new Date(Date.now() - 1000) });
    await subscribe('pat@example.com');
    await outbox.drain();
    expect(transport.sent).toHaveLength(2);
    const res = await confirmWith(tokenOf(linkIn('pat@example.com', 'confirm')));
    expect(res.status).toBe(200);
  });

  it('never mints a second code when someone unsubscribes and joins again', async () => {
    await subscribe('pat@example.com');
    await outbox.drain();
    await confirmWith(tokenOf(linkIn('pat@example.com', 'confirm')));
    await outbox.drain();
    const unsub = await makeShopper(app).call('post', '/newsletter/unsubscribe', {
      token: tokenOf(linkIn('pat@example.com', 'unsubscribe')),
    });
    expect(bodyOf(unsub)).toEqual({ data: { status: 'unsubscribed' } });
    let [sub] = await db.select().from(newsletterSubscribers);
    expect(sub!.status).toBe('unsubscribed');

    await subscribe('pat@example.com');
    await outbox.drain();
    await confirmWith(tokenOf(linkIn('pat@example.com', 'confirm')));
    await outbox.drain();
    [sub] = await db.select().from(newsletterSubscribers);
    expect(sub!.status).toBe('confirmed');
    expect(await codesFor()).toHaveLength(1);
    expect(transport.sent.filter((m) => /Welcome/.test(m.subject))).toHaveLength(1);
    const queued = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.kind, 'newsletter_welcome'));
    expect(queued).toHaveLength(1);
  });

  it('unsubscribe with a bad token is a 404', async () => {
    const res = await makeShopper(app).call('post', '/newsletter/unsubscribe', {
      token: 'y'.repeat(30),
    });
    expect(res.status).toBe(404);
  });
});

describe('the welcome code', () => {
  it('works on the first order and is refused once the customer has ordered', async () => {
    const buyer = await signedIn(app);
    await subscribe(buyer.user.email);
    await outbox.drain();
    await confirmWith(tokenOf(linkIn(buyer.user.email, 'confirm')));
    const code = (await codesFor())[0]!.code;

    const { variants } = await createProduct({ variants: [{ priceCents: 3000 }] });
    await buyer.shopper.addToCart(variants[0]!.id, 1);
    expect((await buyer.shopper.call('post', '/cart/code', { code })).status).toBe(200);
    const placed = await buyer.shopper.call('post', '/checkout', {
      email: buyer.user.email,
      shippingAddress: TEST_ADDRESS,
      shippingMethodCode: 'standard',
    });
    const number = bodyOf<{ data: { orderNumber: string } }>(placed).data.orderNumber;
    expect((await orderByNumber(number)).discountCents).toBe(300);
    await simulate(app, number).expect(200);

    const next = await createProduct({ variants: [{ priceCents: 3000 }] });
    await buyer.shopper.addToCart(next.variants[0]!.id, 1);
    const again = await buyer.shopper.call('post', '/cart/code', { code });
    expect(again.status).toBe(400);
  });
});
