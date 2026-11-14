import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { inventory, stockAlerts } from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { makeShopper } from '../../test/shopper.ts';
import { createOutbox } from '../mail/outbox.ts';

import { sendDueAlerts } from './service.ts';

let app: ReturnType<typeof makeTestApp>;
let transport: MemoryTransport;
let outbox: ReturnType<typeof createOutbox>;
const log = pino({ level: 'silent' });
beforeEach(() => {
  transport = new MemoryTransport();
  outbox = createOutbox({ transport, log });
  app = makeTestApp({ outbox });
});

const soldOut = async (opts: { reserved?: number; quantity?: number } = {}) => {
  const { variants } = await createProduct({ variants: [{ priceCents: 1500, stock: 0 }] });
  const id = variants[0]!.id;
  if (opts.quantity !== undefined || opts.reserved !== undefined) {
    await db
      .update(inventory)
      .set({ quantity: opts.quantity ?? 0, reserved: opts.reserved ?? 0 })
      .where(eq(inventory.variantId, id));
  }
  return { id, sku: variants[0]!.sku };
};
const ask = (variantId: string, email = 'pat@example.com', shopper = makeShopper(app)) =>
  shopper.call('post', '/stock-alerts', { variantId, email });
const alerts = () => db.select().from(stockAlerts);
const setStock = (variantId: string, set: Partial<typeof inventory.$inferInsert>) =>
  db.update(inventory).set(set).where(eq(inventory.variantId, variantId));

describe('asking for an alert', () => {
  it('stores a waiting alert for a sold-out variant; asking twice is one alert', async () => {
    const v = await soldOut();
    expect((await ask(v.id, 'Pat@Example.com')).status).toBe(201);
    expect((await ask(v.id, 'pat@example.com')).status).toBe(201);
    const rows = await alerts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'pat@example.com', status: 'waiting', dueAt: null });
  });

  it('refuses an in-stock variant, an unknown one and a bad email', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1500, stock: 4 }] });
    expect((await ask(variants[0]!.id)).status).toBe(409);
    expect((await ask('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    const v = await soldOut();
    expect((await ask(v.id, 'not-an-email')).status).toBe(400);
  });

  it('allows at most 5 waiting alerts per address', async () => {
    for (let i = 0; i < 5; i++) expect((await ask((await soldOut()).id)).status).toBe(201);
    expect((await ask((await soldOut()).id)).status).toBe(400);
    expect((await ask((await soldOut()).id, 'other@example.com')).status).toBe(201);
  });
});

describe('the restock trigger', () => {
  it('fires only when available stock goes from 0 to above 0', async () => {
    const a = await soldOut();
    const b = await soldOut({ quantity: 2, reserved: 2 }); // held by pending orders
    const c = await soldOut();
    for (const v of [a, b, c]) await ask(v.id);
    const dueOf = async (id: string) =>
      (await db.select().from(stockAlerts).where(eq(stockAlerts.variantId, id)))[0]!.dueAt;

    await setStock(c.id, { lowStockThreshold: 9 }); // not a stock change
    await setStock(c.id, { quantity: 0, reserved: 0 }); // 0 stays 0
    expect(await dueOf(c.id)).toBeNull();

    await setStock(a.id, { quantity: 5 }); // restocked
    await setStock(b.id, { reserved: 1 }); // a reservation was released
    expect(await dueOf(a.id)).toBeInstanceOf(Date);
    expect(await dueOf(b.id)).toBeInstanceOf(Date);
    expect(await dueOf(c.id)).toBeNull();
  });

  it('a change from 5 to 6 does not touch alerts (nothing was waiting on it)', async () => {
    const v = await soldOut();
    await setStock(v.id, { quantity: 5 });
    await setStock(v.id, { quantity: 6 });
    expect(await alerts()).toHaveLength(0);
  });
});

describe('the send-stock-alerts job', () => {
  it('sends one email per alert, once, with the product link and a cancel link', async () => {
    const v = await soldOut();
    await ask(v.id);
    await ask(v.id, 'sam@example.com');
    await setStock(v.id, { quantity: 3 });
    expect(await sendDueAlerts({ outbox, log })).toEqual({ sent: 2, deferred: 0 });
    await outbox.drain();
    expect(transport.sent).toHaveLength(2);
    const mail = transport.sent.find((m) => m.to === 'pat@example.com')!;
    expect(mail.text).toContain(`?variant=${v.sku}`);
    expect(mail.text).toMatch(/stock-alerts\/cancel\?token=\S+/);
    expect((await alerts()).every((a) => a.status === 'sent' && a.sentAt)).toBe(true);

    // a second run (or a second restock) sends nothing more
    expect(await sendDueAlerts({ outbox, log })).toEqual({ sent: 0, deferred: 0 });
    await setStock(v.id, { quantity: 0 });
    await setStock(v.id, { quantity: 4 });
    await sendDueAlerts({ outbox, log });
    await outbox.drain();
    expect(transport.sent).toHaveLength(2);
  });

  it('skips a cancelled alert, and the cancel link works once or twice', async () => {
    const v = await soldOut();
    await ask(v.id);
    const [row] = await alerts();
    const shopper = makeShopper(app);
    expect((await shopper.call('delete', `/stock-alerts/${row!.token}`)).status).toBe(204);
    expect((await shopper.call('delete', `/stock-alerts/${row!.token}`)).status).toBe(204);
    expect((await shopper.call('delete', `/stock-alerts/${'z'.repeat(30)}`)).status).toBe(404);
    await setStock(v.id, { quantity: 3 });
    expect(await sendDueAlerts({ outbox, log })).toEqual({ sent: 0, deferred: 0 });
    await outbox.drain();
    expect(transport.sent).toHaveLength(0);
  });

  it('holds an alert whose stock sold out again before the job ran, for the next restock', async () => {
    const v = await soldOut();
    await ask(v.id);
    await setStock(v.id, { quantity: 1 });
    await setStock(v.id, { quantity: 0 }); // sold out again before the hourly tick
    expect(await sendDueAlerts({ outbox, log })).toEqual({ sent: 0, deferred: 1 });
    expect((await alerts())[0]).toMatchObject({ status: 'waiting', dueAt: null });
    await setStock(v.id, { quantity: 2 });
    expect(await sendDueAlerts({ outbox, log })).toEqual({ sent: 1, deferred: 0 });
  });
});
