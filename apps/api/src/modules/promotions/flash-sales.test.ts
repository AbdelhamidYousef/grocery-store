import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  discountCodes,
  flashSaleItems,
  flashSales,
  orders,
  priceHistory,
  productVariants,
} from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

import * as repo from './repo.ts';
import { omnibusReference, syncFlashSales } from './service.ts';

const app = makeTestApp({ payments: new FakeStripe() });

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

async function variant(priceCents = 1000, extra: { isTrial?: boolean } = {}) {
  const { variants, product } = await createProduct({ variants: [{ priceCents, ...extra }] });
  return { id: variants[0]!.id, productId: product.id, slug: product.slug };
}

async function history(
  variantId: string,
  priceCents: number,
  validFrom: Date,
  kind: 'base' | 'sale' | 'member' = 'base',
) {
  await db.insert(priceHistory).values({ variantId, priceCents, kind, validFrom });
}

async function sale(opts: {
  startsAt: Date;
  endsAt: Date;
  status?: 'scheduled' | 'active' | 'ended';
  items: { variantId: string; salePriceCents: number }[];
  name?: string;
}) {
  const [row] = await db
    .insert(flashSales)
    .values({
      name: opts.name ?? 'Flash',
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      status: opts.status ?? 'scheduled',
    })
    .returning();
  await db.insert(flashSaleItems).values(opts.items.map((i) => ({ saleId: row!.id, ...i })));
  return row!;
}

async function referenceOf(saleId: string, variantId: string) {
  const [row] = await db
    .select()
    .from(flashSaleItems)
    .where(and(eq(flashSaleItems.saleId, saleId), eq(flashSaleItems.variantId, variantId)));
  return row!.referenceCents;
}

describe('omnibusReference (pure)', () => {
  const start = new Date('2026-11-10T00:00:00Z');
  const at = (days: number) => new Date(start.getTime() - days * DAY);
  it('is null without history', () => expect(omnibusReference([], start)).toBeNull());
  it('takes the price in effect at the window start plus every change inside it', () => {
    const h = [
      { priceCents: 800, validFrom: at(5) },
      { priceCents: 1500, validFrom: at(20) },
      { priceCents: 1000, validFrom: at(60) },
    ];
    expect(omnibusReference(h, start)).toBe(800);
  });
  it('a price exactly 30 days old counts as the one in effect at the window start', () => {
    expect(omnibusReference([{ priceCents: 900, validFrom: at(30) }], start)).toBe(900);
  });
});

describe('flash sale activation and the Omnibus reference', () => {
  it('ignores the price of the sale itself and writes it to history at starts_at', async () => {
    const v = await variant(1000);
    await history(v.id, 1000, ago(60 * DAY));
    const startsAt = ago(HOUR);
    const s = await sale({
      startsAt,
      endsAt: ahead(DAY),
      items: [{ variantId: v.id, salePriceCents: 500 }],
    });
    await syncFlashSales(db);
    expect(await referenceOf(s.id, v.id)).toBe(1000);
    const rows = await db
      .select()
      .from(priceHistory)
      .where(and(eq(priceHistory.variantId, v.id), eq(priceHistory.kind, 'sale')));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ priceCents: 500 });
    expect(rows[0]?.validFrom.getTime()).toBe(startsAt.getTime());
    const [after] = await db.select().from(flashSales).where(eq(flashSales.id, s.id));
    expect(after?.status).toBe('active');
  });

  it('uses the lower earlier price when the price was raised and then cut inside 30 days', async () => {
    const v = await variant(1000);
    await history(v.id, 1000, ago(60 * DAY));
    await history(v.id, 1500, ago(20 * DAY));
    await history(v.id, 800, ago(5 * DAY));
    const s = await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: v.id, salePriceCents: 700 }],
    });
    await syncFlashSales(db);
    expect(await referenceOf(s.id, v.id)).toBe(800);
  });

  it('counts a price older than 30 days as the price in effect at the window start', async () => {
    const v = await variant(1200);
    await history(v.id, 700, ago(90 * DAY));
    await history(v.id, 1200, ago(10 * DAY));
    const s = await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: v.id, salePriceCents: 650 }],
    });
    await syncFlashSales(db);
    // 700 was charged until 10 days ago, which is inside the window
    expect(await referenceOf(s.id, v.id)).toBe(700);
  });

  it('leaves the reference null without any history, and shows no strike-through source', async () => {
    const v = await variant(1000);
    const s = await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: v.id, salePriceCents: 500 }],
    });
    await syncFlashSales(db);
    expect(await referenceOf(s.id, v.id)).toBeNull();
    const res = await makeShopper(app).call('get', `/products/${v.slug}`);
    const detail = bodyOf<{ data: { variants: { sale: unknown }[] } }>(res).data;
    expect(detail.variants[0]?.sale).toMatchObject({ priceCents: 500, referenceCents: null });
  });

  it('never uses compare_at_price as the reference', async () => {
    const { variants } = await createProduct({
      variants: [{ priceCents: 1000, compareAtPriceCents: 2000 }],
    });
    const s = await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: variants[0]!.id, salePriceCents: 500 }],
    });
    await syncFlashSales(db);
    expect(await referenceOf(s.id, variants[0]!.id)).toBeNull();
  });

  it('is active at ends_at minus 1 ms and over at ends_at', async () => {
    const v = await variant(1000);
    const startsAt = ago(HOUR);
    const endsAt = ahead(HOUR);
    const s = await sale({ startsAt, endsAt, items: [{ variantId: v.id, salePriceCents: 500 }] });
    await syncFlashSales(db, ahead(1000));
    const lastMs = new Date(endsAt.getTime() - 1);
    expect(await repo.activeSales(db, { variantIds: [v.id] }, lastMs)).toHaveLength(1);
    expect(await repo.activeSales(db, { variantIds: [v.id] }, endsAt)).toHaveLength(0);
    await syncFlashSales(db, lastMs);
    expect((await db.select().from(flashSales).where(eq(flashSales.id, s.id)))[0]?.status).toBe(
      'active',
    );
    await syncFlashSales(db, endsAt);
    expect((await db.select().from(flashSales).where(eq(flashSales.id, s.id)))[0]?.status).toBe(
      'ended',
    );
  });

  it('does not trust status alone: an "active" sale that has not started offers nothing', async () => {
    const v = await variant(1000);
    await sale({
      startsAt: ahead(DAY),
      endsAt: ahead(2 * DAY),
      status: 'active',
      items: [{ variantId: v.id, salePriceCents: 500 }],
    });
    expect(await repo.activeSales(db, { variantIds: [v.id] }, new Date())).toHaveLength(0);
  });

  it('never activates a sale whose whole window has passed (its price was never offered)', async () => {
    const v = await variant(1000);
    await sale({
      startsAt: ago(3 * DAY),
      endsAt: ago(2 * DAY),
      items: [{ variantId: v.id, salePriceCents: 500 }],
    });
    await syncFlashSales(db);
    expect(await db.select().from(priceHistory).where(eq(priceHistory.kind, 'sale'))).toHaveLength(
      0,
    );
    expect((await db.select().from(flashSales))[0]?.status).toBe('ended');
  });

  it('writes each history row once when two syncs run at the same time', async () => {
    const a = await variant(1000);
    const b = await variant(1000);
    await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [
        { variantId: a.id, salePriceCents: 500 },
        { variantId: b.id, salePriceCents: 600 },
      ],
    });
    await Promise.all([syncFlashSales(db), syncFlashSales(db), syncFlashSales(db)]);
    const rows = await db.select().from(priceHistory).where(eq(priceHistory.kind, 'sale'));
    expect(rows).toHaveLength(2);
  });

  it('lets a later sale see an earlier sale price in its reference', async () => {
    const v = await variant(1000);
    await history(v.id, 1000, ago(90 * DAY));
    await sale({
      startsAt: ago(10 * DAY),
      endsAt: ago(9 * DAY),
      items: [{ variantId: v.id, salePriceCents: 400 }],
    });
    // The first sale is activated while it is running, as it would have been.
    await syncFlashSales(db, ago(10 * DAY - HOUR));
    const second = await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: v.id, salePriceCents: 700 }],
    });
    await syncFlashSales(db);
    expect(await referenceOf(second.id, v.id)).toBe(400);
  });

  it('records the return to the regular price when a sale ends, so an old sale stops counting', async () => {
    const v = await variant(1000);
    await history(v.id, 1000, ago(120 * DAY));
    const old = await sale({
      startsAt: ago(60 * DAY),
      endsAt: ago(50 * DAY),
      items: [{ variantId: v.id, salePriceCents: 400 }],
    });
    await syncFlashSales(db, ago(60 * DAY - HOUR)); // activated while it ran
    await syncFlashSales(db, ago(50 * DAY - HOUR) /* still running */);
    await syncFlashSales(db, ago(50 * DAY)); // ended: back to 10.00 from ends_at
    const rows = await db
      .select()
      .from(priceHistory)
      .where(and(eq(priceHistory.variantId, v.id), eq(priceHistory.kind, 'base')));
    expect(rows.map((r) => r.validFrom.getTime())).toContain(old.endsAt.getTime());

    // 50 days later the old 4.00 is outside the 30-day window: the reference is 10.00.
    const next = await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: v.id, salePriceCents: 700 }],
    });
    await syncFlashSales(db);
    expect(await referenceOf(next.id, v.id)).toBe(1000);
  });
});

describe('sale prices in the catalog', () => {
  it('puts the lowest applicable sale on the card and on each variant', async () => {
    const { variants, product } = await createProduct({
      variants: [{ priceCents: 1000 }, { priceCents: 2000 }],
    });
    const [a, b] = [variants[0]!.id, variants[1]!.id];
    await history(a, 1000, ago(60 * DAY));
    await history(b, 2000, ago(60 * DAY));
    // Overlapping sales on variant a: the lowest price wins.
    const startsAt = ago(HOUR);
    await sale({
      startsAt,
      endsAt: ahead(2 * DAY),
      items: [
        { variantId: a, salePriceCents: 700 },
        { variantId: b, salePriceCents: 1800 },
      ],
    });
    await sale({
      startsAt,
      endsAt: ahead(DAY),
      items: [{ variantId: a, salePriceCents: 600 }],
    });
    const shop = makeShopper(app);
    const detail = bodyOf<{
      data: {
        variants: { id: string; sale: { priceCents: number; referenceCents: number } | null }[];
      };
    }>(await shop.call('get', `/products/${product.slug}`)).data;
    expect(detail.variants.find((v) => v.id === a)?.sale).toMatchObject({
      priceCents: 600,
      referenceCents: 1000,
    });
    expect(detail.variants.find((v) => v.id === b)?.sale).toMatchObject({ priceCents: 1800 });

    const list = bodyOf<{
      data: {
        id: string;
        sale: { priceCents: number; basePriceCents: number; endsAt: string } | null;
      }[];
    }>(await shop.call('get', '/products')).data;
    const card = list.find((c) => c.id === product.id);
    expect(card?.sale).toMatchObject({ priceCents: 600, basePriceCents: 1000 });
    // earliest end among the sale variants
    expect(new Date(card!.sale!.endsAt).getTime()).toBeLessThan(Date.now() + 1.5 * DAY);
  });

  it('shows no sale on a product nobody discounted', async () => {
    const plain = await variant(1000);
    const other = await variant(2000);
    await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: other.id, salePriceCents: 100 }],
    });
    const shop = makeShopper(app);
    const list = bodyOf<{ data: { id: string; sale: unknown }[] }>(
      await shop.call('get', '/products'),
    ).data;
    expect(list.find((c) => c.id === plain.productId)?.sale).toBeNull();
    expect(list.find((c) => c.id === other.productId)?.sale).toMatchObject({ priceCents: 100 });
  });
});

describe('sale prices in the cart and at checkout', () => {
  const addr = {
    fullName: 'Ada Lovelace',
    line1: '1 Bone Street',
    city: 'Riga',
    postalCode: 'LV-1010',
    country: 'DE',
  };
  const checkoutBody = {
    email: 'ada@grocery.test',
    shippingAddress: addr,
    shippingMethodCode: 'standard',
  };

  it('activates lazily on a cart read and charges the sale price in cart and order', async () => {
    await createShippingMethods();
    const v = await variant(2000);
    await history(v.id, 1800, ago(10 * DAY));
    await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: v.id, salePriceCents: 1500 }],
    });
    const shop = makeShopper(app);
    await shop.addToCart(v.id, 2);
    const cart = bodyOf<{
      data: {
        pricing: { merchandiseCents: number; lines: { unitCents: number; priceSource: string }[] };
      };
    }>(await shop.call('get', '/cart')).data;
    // The cart carries the Omnibus reference (lowest price in the 30 days before the sale).
    expect(cart.pricing.lines[0]).toMatchObject({
      unitCents: 1500,
      priceSource: 'sale',
      referenceCents: 1800,
    });
    expect(cart.pricing.merchandiseCents).toBe(3000);

    expect((await shop.call('post', '/checkout', checkoutBody)).status).toBe(200);
    const [order] = await db.select().from(orders);
    expect(order?.subtotalCents).toBe(3000);
  });

  it('prices a variant in two sales at the lowest sale price', async () => {
    await createShippingMethods();
    const v = await variant(2000);
    for (const price of [1700, 1200, 1500]) {
      await sale({
        startsAt: ago(HOUR),
        endsAt: ahead(DAY),
        items: [{ variantId: v.id, salePriceCents: price }],
      });
    }
    const shop = makeShopper(app);
    await shop.addToCart(v.id);
    const cart = bodyOf<{ data: { pricing: { merchandiseCents: number } } }>(
      await shop.call('get', '/cart'),
    ).data;
    expect(cart.pricing.merchandiseCents).toBe(1200);
  });

  it('ignores a sale line for a code that excludes sale items', async () => {
    await createShippingMethods();
    await db
      .insert(discountCodes)
      .values({ code: 'NOSALE', kind: 'percent', value: 10, excludeSaleItems: true });
    const onSale = await variant(2000);
    const regular = await variant(1000);
    await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: onSale.id, salePriceCents: 1500 }],
    });
    const shop = makeShopper(app);
    await shop.addToCart(onSale.id);
    await shop.addToCart(regular.id);
    await shop.call('post', '/cart/code', { code: 'NOSALE' });
    const cart = bodyOf<{ data: { pricing: { discountCents: number } } }>(
      await shop.call('get', '/cart'),
    ).data;
    // 10% of the regular line only (1000), not of the 1500 sale line
    expect(cart.pricing.discountCents).toBe(100);
    expect((await shop.call('post', '/checkout', checkoutBody)).status).toBe(200);
    const [order] = await db.select().from(orders);
    expect(order).toMatchObject({ subtotalCents: 2500, discountCents: 100 });
  });

  it('keeps a trial size at its fixed price even when a sale lists it', async () => {
    await createShippingMethods();
    const t = await variant(300, { isTrial: true });
    await sale({
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      items: [{ variantId: t.id, salePriceCents: 100 }],
    });
    const shop = makeShopper(app);
    await shop.addToCart(t.id);
    const cart = bodyOf<{
      data: { pricing: { lines: { unitCents: number; priceSource: string }[] } };
    }>(await shop.call('get', '/cart')).data;
    expect(cart.pricing.lines[0]).toMatchObject({ unitCents: 300, priceSource: 'fixed' });
    expect((await shop.call('post', '/checkout', checkoutBody)).status).toBe(200);
    expect((await db.select().from(orders))[0]?.subtotalCents).toBe(300);
  });
});

describe('GET /promotions/banner and /promotions/rules', () => {
  const get = (path: string) => makeShopper(app).call('get', path);
  interface Banner {
    data: { sale: { name: string; status: string } | null; serverNow: string };
  }

  it('answers null when there is no sale, with the server clock', async () => {
    const res = await get('/promotions/banner');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { data } = bodyOf<Banner>(res);
    expect(data.sale).toBeNull();
    expect(Math.abs(new Date(data.serverNow).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('prefers the active sale ending soonest, else the next scheduled one', async () => {
    const v = await variant(1000);
    const items = [{ variantId: v.id, salePriceCents: 500 }];
    await sale({ name: 'Later', startsAt: ahead(2 * DAY), endsAt: ahead(3 * DAY), items });
    expect(bodyOf<Banner>(await get('/promotions/banner')).data.sale).toMatchObject({
      name: 'Later',
      status: 'scheduled',
    });
    await sale({ name: 'Soon', startsAt: ahead(DAY), endsAt: ahead(2 * DAY), items });
    expect(bodyOf<Banner>(await get('/promotions/banner')).data.sale?.name).toBe('Soon');
    await sale({ name: 'Long', startsAt: ago(HOUR), endsAt: ahead(5 * DAY), items });
    await sale({ name: 'Ending', startsAt: ago(HOUR), endsAt: ahead(2 * HOUR), items });
    expect(bodyOf<Banner>(await get('/promotions/banner')).data.sale).toMatchObject({
      name: 'Ending',
      status: 'active',
    });
  });

  it('lists the active tiers, the gift threshold and the free-delivery threshold', async () => {
    await createShippingMethods();
    const res = await get('/promotions/rules');
    expect(res.status).toBe(200);
    const { data } = bodyOf<{
      data: { tiers: unknown[]; gift: unknown; freeDeliveryThresholdCents: number | null };
    }>(res);
    expect(data.tiers).toEqual([]);
    expect(data.gift).toBeNull();
    expect(data.freeDeliveryThresholdCents).toBe(4900);
  });
});

describe('admin price edits and the price history', () => {
  it('appends a base row when a price changes, and none when it does not', async () => {
    const admin = await signedIn(app, 'admin', 'boss@grocery.test');
    const v = await variant(1000);
    await history(v.id, 1000, ago(60 * DAY));
    const patch = (body: object) => admin.shopper.call('patch', `/admin/variants/${v.id}`, body);
    expect((await patch({ priceCents: 1200 })).status).toBe(200);
    expect((await patch({ priceCents: 1200, name: 'Renamed' })).status).toBe(200);
    const rows = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.variantId, v.id))
      .orderBy(priceHistory.validFrom);
    expect(rows.map((r) => [r.kind, r.priceCents])).toEqual([
      ['base', 1000],
      ['base', 1200],
    ]);
    const [current] = await db.select().from(productVariants).where(eq(productVariants.id, v.id));
    expect(current?.priceCents).toBe(1200);
  });

  it('writes the first history row when a variant is created', async () => {
    const admin = await signedIn(app, 'admin', 'boss@grocery.test');
    const product = (await variant(1000)).productId;
    const res = await admin.shopper.call('post', `/admin/products/${product}/variants`, {
      sku: 'NEW-SKU-1',
      name: 'New',
      options: { variant: 'new' },
      priceCents: 1499,
      weightGrams: 100,
      stock: 5,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [row] = await db.select().from(priceHistory).where(eq(priceHistory.priceCents, 1499));
    expect(row).toMatchObject({ kind: 'base' });
  });
});
