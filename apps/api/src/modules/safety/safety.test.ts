import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  safetyNoticeDeliveries,
  safetyNoticeVariants,
  safetyNotices,
} from '../../db/schema/index.ts';
import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { placeOrder, signedIn, simulate } from '../../test/orders.ts';
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

const HOUR = 3600_000;
async function notice(variantIds: string[], over: Partial<typeof safetyNotices.$inferInsert> = {}) {
  const [row] = await db
    .insert(safetyNotices)
    .values({
      title: 'Chew toy recall',
      bodyMd: 'Stop using the **red** rope.',
      severity: 'recall',
      ...over,
    })
    .returning();
  if (variantIds.length > 0) {
    await db
      .insert(safetyNoticeVariants)
      .values(variantIds.map((variantId) => ({ noticeId: row!.id, variantId })));
  }
  return row!;
}

interface Notice {
  id: string;
  title: string;
  severity: string;
}
const active = async () =>
  bodyOf<{ data: Notice[] }>(await request(app).get('/api/v1/safety-notices/active')).data;

describe('GET /safety-notices/active', () => {
  it('returns running notices, most severe first', async () => {
    await notice([], { title: 'Info', severity: 'info' });
    await notice([], { title: 'Recall', severity: 'recall' });
    await notice([], { title: 'Warn', severity: 'warning' });
    expect((await active()).map((n) => n.title)).toEqual(['Recall', 'Warn', 'Info']);
  });

  it('does not return an expired, a future or a draft notice', async () => {
    await notice([], {
      title: 'expired',
      startsAt: new Date(Date.now() - 3 * HOUR),
      endsAt: new Date(Date.now() - HOUR),
    });
    await notice([], { title: 'future', startsAt: new Date(Date.now() + HOUR) });
    await notice([], { title: 'draft', status: 'draft' });
    await notice([], { title: 'open-ended', endsAt: null });
    expect((await active()).map((n) => n.title)).toEqual(['open-ended']);
  });

  it('refuses an end date before the start date', async () => {
    await expect(
      notice([], { startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now()) }),
    ).rejects.toThrow();
  });
});

describe('product detail', () => {
  it('lists the active notices that touch one of its variants, and only those', async () => {
    const { product, variants } = await createProduct({ variants: [{}, {}] });
    const { variants: other } = await createProduct();
    await notice([variants[1]!.id], { title: 'Hits variant two' });
    await notice([other[0]!.id], { title: 'Other product' });
    await notice([variants[0]!.id], {
      title: 'Expired',
      startsAt: new Date(Date.now() - 3 * HOUR),
      endsAt: new Date(Date.now() - HOUR),
    });
    const res = await request(app).get(`/api/v1/products/${product.slug}`);
    const titles = bodyOf<{ data: { safetyNotices: Notice[] } }>(res).data.safetyNotices.map(
      (n) => n.title,
    );
    expect(titles).toEqual(['Hits variant two']);
  });

  it('has an empty list when nothing applies', async () => {
    const { product } = await createProduct();
    const res = await request(app).get(`/api/v1/products/${product.slug}`);
    expect(bodyOf<{ data: { safetyNotices: unknown[] } }>(res).data.safetyNotices).toEqual([]);
  });
});

describe('POST /admin/safety-notices/:id/notify', () => {
  let admin: Awaited<ReturnType<typeof signedIn>> | undefined;
  beforeEach(() => {
    admin = undefined;
  });
  async function adminCall(id: string) {
    admin ??= await signedIn(app, 'admin', 'boss@pawsome.test');
    return admin.shopper.call('post', `/admin/safety-notices/${id}/notify`, {});
  }

  it('requires an admin', async () => {
    const n = await notice([]);
    const res = await request(app)
      .post(`/api/v1/admin/safety-notices/${n.id}/notify`)
      .set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(401);
  });

  it('emails each past buyer of an affected variant once, guests included', async () => {
    const { variants } = await createProduct();
    const variantId = variants[0]!.id;
    const a = await placeOrder(app, { variantId, email: 'guest@pawsome.test' });
    const b = await placeOrder(app, { variantId, email: 'second@pawsome.test' });
    const again = await placeOrder(app, { variantId, email: 'GUEST@pawsome.test' });
    const unrelated = await placeOrder(app, { email: 'unrelated@pawsome.test' });
    const unpaid = await placeOrder(app, { variantId, email: 'unpaid@pawsome.test' });
    for (const o of [a, b, again, unrelated]) await simulate(app, o.number);
    void unpaid;
    const n = await notice([variantId]);

    const res = await adminCall(n.id);
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { queued: number } }>(res).data.queued).toBe(2);

    await outbox.drain();
    const recipients = transport.sent
      .filter((m) => m.subject.includes('recall'))
      .map((m) => m.to.toLowerCase())
      .sort();
    expect(recipients).toEqual(['guest@pawsome.test', 'second@pawsome.test']);
    expect(
      transport.sent.find((m) => m.to === 'guest@pawsome.test' && m.subject.includes('recall'))
        ?.text,
    ).toContain('red');
  });

  it('sends nothing the second time, and only the new buyers after more orders', async () => {
    const { variants } = await createProduct();
    const variantId = variants[0]!.id;
    const first = await placeOrder(app, { variantId, email: 'one@pawsome.test' });
    await simulate(app, first.number);
    const n = await notice([variantId]);

    await adminCall(n.id);
    const second = await adminCall(n.id);
    expect(bodyOf<{ data: { queued: number; alreadyNotified: number } }>(second).data).toEqual({
      queued: 0,
      alreadyNotified: 1,
    });
    await outbox.drain();
    expect(
      transport.sent.filter((m) => m.to === 'one@pawsome.test' && m.subject.includes('recall')),
    ).toHaveLength(1);

    const late = await placeOrder(app, { variantId, email: 'late@pawsome.test' });
    await simulate(app, late.number);
    const third = await adminCall(n.id);
    expect(bodyOf<{ data: { queued: number } }>(third).data.queued).toBe(1);
    expect(await db.select().from(safetyNoticeDeliveries)).toHaveLength(2);
  });

  it('answers 404 for an unknown notice', async () => {
    expect((await adminCall('00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});
