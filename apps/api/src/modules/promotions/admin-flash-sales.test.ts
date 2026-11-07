import { Writable } from 'node:stream';

import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  flashSaleItems,
  flashSales,
  priceHistory,
  productVariants,
} from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { makeShopper, type Shopper } from '../../test/shopper.ts';

const lines: Record<string, unknown>[] = [];
const logger = pino(
  { level: 'info' },
  new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      cb();
    },
  }),
);
const app = makeTestApp({ logger });
let admin: Shopper;

beforeEach(async () => {
  lines.length = 0;
  admin = (await signedIn(app, 'admin', 'boss@pawsome.test')).shopper;
});

const HOUR = 3600 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const audits = () => lines.filter((l) => l.audit === true);
const data = <T>(res: Parameters<typeof bodyOf>[0]) => bodyOf<{ data: T }>(res).data;

async function variantWithSku(sku: string, priceCents = 2000) {
  const { variants } = await createProduct({ variants: [{ priceCents }] });
  await db.update(productVariants).set({ sku }).where(eq(productVariants.id, variants[0]!.id));
  return variants[0]!.id;
}

const body = (over: Record<string, unknown> = {}) => ({
  name: 'Weekend Woof',
  startsAt: iso(2 * HOUR),
  endsAt: iso(6 * HOUR),
  items: [{ variant: 'FS-A', salePriceCents: 1500 }],
  ...over,
});

type Sale = { id: string; status: string; itemCount: number; items: { regularCents: number }[] };

async function create(sku: string, over: Record<string, unknown> = {}) {
  await variantWithSku(sku);
  const res = await admin.call(
    'post',
    '/admin/flash-sales',
    body({ items: [{ variant: sku, salePriceCents: 1500 }], ...over }),
  );
  expect(res.status).toBe(201);
  return data<Sale>(res);
}

describe('access', () => {
  it.each([
    ['get', '/admin/flash-sales'],
    ['post', '/admin/flash-sales'],
    ['put', '/admin/flash-sales/00000000-0000-4000-8000-000000000000'],
    ['delete', '/admin/flash-sales/00000000-0000-4000-8000-000000000000'],
  ] as const)('%s %s: 403 for a customer, 401 for a guest', async (method, path) => {
    const customer = (await signedIn(app, 'customer')).shopper;
    expect((await customer.call(method, path, {})).status).toBe(403);
    expect((await makeShopper(app).call(method, path, {})).status).toBe(401);
  });
});

describe('create and list', () => {
  it('creates a scheduled sale with its items, lists it with status and count, and audits', async () => {
    const sale = await create('FS-A');
    expect(sale).toMatchObject({ status: 'scheduled', itemCount: 1 });
    expect(sale.items[0]).toMatchObject({
      regularCents: 2000,
      salePriceCents: 1500,
      referenceCents: null,
    });
    const list = data<Sale[]>(await admin.call('get', '/admin/flash-sales'));
    expect(list.find((s) => s.id === sale.id)).toMatchObject({ status: 'scheduled', itemCount: 1 });
    expect(audits().at(-1)).toMatchObject({ action: 'flash_sale.create', target: sale.id });
  });

  it('accepts a variant id as well as a SKU, and never writes reference or history', async () => {
    const id = await variantWithSku('FS-ID');
    const res = await admin.call(
      'post',
      '/admin/flash-sales',
      body({ items: [{ variant: id, salePriceCents: 100 }] }),
    );
    expect(res.status).toBe(201);
    const [item] = await db.select().from(flashSaleItems);
    expect(item!.referenceCents).toBeNull();
    expect(await db.select().from(priceHistory)).toHaveLength(0);
  });

  it('rejects an end before the start', async () => {
    await variantWithSku('FS-A');
    const res = await admin.call(
      'post',
      '/admin/flash-sales',
      body({ startsAt: iso(5 * HOUR), endsAt: iso(2 * HOUR) }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(errorOf(res))).toContain('The end must be after the start');
    expect(await db.select().from(flashSales)).toHaveLength(0);
  });

  it('rejects a sale price at or above the regular price, naming the row', async () => {
    await variantWithSku('FS-A', 2000);
    for (const price of [2000, 2500]) {
      const res = await admin.call(
        'post',
        '/admin/flash-sales',
        body({ items: [{ variant: 'FS-A', salePriceCents: price }] }),
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(errorOf(res))).toContain('items.0.salePriceCents');
    }
    const zero = await admin.call(
      'post',
      '/admin/flash-sales',
      body({ items: [{ variant: 'FS-A', salePriceCents: 0 }] }),
    );
    expect(zero.status).toBe(400);
  });

  it('rejects an unknown SKU and the same variant twice', async () => {
    await variantWithSku('FS-A');
    const unknown = await admin.call(
      'post',
      '/admin/flash-sales',
      body({ items: [{ variant: 'NOPE', salePriceCents: 100 }] }),
    );
    expect(JSON.stringify(errorOf(unknown))).toContain('No variant has that SKU');
    const twice = await admin.call(
      'post',
      '/admin/flash-sales',
      body({
        items: [
          { variant: 'FS-A', salePriceCents: 100 },
          { variant: 'fs-a', salePriceCents: 200 },
        ],
      }),
    );
    expect(twice.status).toBe(400);
    expect(JSON.stringify(errorOf(twice))).toContain('items.1.variant');
  });

  it('looks a variant up by SKU for the form', async () => {
    await variantWithSku('FS-LOOK', 1234);
    expect(
      data<{ regularCents: number }>(
        await admin.call('get', '/admin/flash-sales/variant-lookup?sku=FS-LOOK'),
      ).regularCents,
    ).toBe(1234);
    expect((await admin.call('get', '/admin/flash-sales/variant-lookup?sku=NOPE')).status).toBe(
      404,
    );
  });
});

describe('editing rules', () => {
  it('updates a scheduled sale (name, window and items)', async () => {
    const sale = await create('FS-A');
    await variantWithSku('FS-B', 900);
    const res = await admin.call(
      'put',
      `/admin/flash-sales/${sale.id}`,
      body({ name: 'Renamed', items: [{ variant: 'FS-B', salePriceCents: 500 }] }),
    );
    expect(res.status).toBe(200);
    expect(data<{ name: string; items: unknown[] }>(res)).toMatchObject({ name: 'Renamed' });
    expect(audits().at(-1)).toMatchObject({ action: 'flash_sale.update', target: sale.id });
  });

  async function activeSale() {
    const sale = await create('FS-ACT');
    await db
      .update(flashSales)
      .set({
        status: 'active',
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + 3 * HOUR),
      })
      .where(eq(flashSales.id, sale.id));
    return sale;
  }

  it('refuses to edit the items of an active sale', async () => {
    const sale = await activeSale();
    const res = await admin.call(
      'put',
      `/admin/flash-sales/${sale.id}`,
      body({ items: [{ variant: 'FS-ACT', salePriceCents: 1 }] }),
    );
    expect(res.status).toBe(409);
    const [item] = await db.select().from(flashSaleItems).where(eq(flashSaleItems.saleId, sale.id));
    expect(item!.salePriceCents).toBe(1500);
  });

  it('refuses to delete an active or ended sale but deletes a scheduled one', async () => {
    const active = await activeSale();
    expect((await admin.call('delete', `/admin/flash-sales/${active.id}`)).status).toBe(409);
    await db.update(flashSales).set({ status: 'ended' }).where(eq(flashSales.id, active.id));
    expect((await admin.call('delete', `/admin/flash-sales/${active.id}`)).status).toBe(409);
    const scheduled = await create('FS-SCHED');
    expect((await admin.call('delete', `/admin/flash-sales/${scheduled.id}`)).status).toBe(204);
    expect(audits().at(-1)).toMatchObject({ action: 'flash_sale.delete', target: scheduled.id });
    expect(await db.select().from(flashSales).where(eq(flashSales.id, scheduled.id))).toHaveLength(
      0,
    );
  });

  it('lets an active sale end earlier but not later', async () => {
    const sale = await activeSale();
    const later = await admin.call('patch', `/admin/flash-sales/${sale.id}`, {
      endsAt: iso(9 * HOUR),
    });
    expect(later.status).toBe(400);
    const earlier = await admin.call('patch', `/admin/flash-sales/${sale.id}`, {
      endsAt: iso(HOUR),
    });
    expect(earlier.status).toBe(200);
    expect(data<{ status: string }>(earlier).status).toBe('active');
    expect(audits().at(-1)).toMatchObject({ action: 'flash_sale.shorten', target: sale.id });
  });

  it('ends an active sale now and records the price going back to regular', async () => {
    const sale = await activeSale();
    const res = await admin.call('post', `/admin/flash-sales/${sale.id}/end`);
    expect(res.status).toBe(200);
    expect(data<{ status: string }>(res).status).toBe('ended');
    expect(audits().at(-1)).toMatchObject({ action: 'flash_sale.end', target: sale.id });
    const history = await db.select().from(priceHistory);
    expect(history.map((h) => [h.kind, h.priceCents])).toEqual([['base', 2000]]);
  });

  it('refuses to end a sale that is not running', async () => {
    const sale = await create('FS-A');
    expect((await admin.call('post', `/admin/flash-sales/${sale.id}/end`)).status).toBe(409);
  });
});
