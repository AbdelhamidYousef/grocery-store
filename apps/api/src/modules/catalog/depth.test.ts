import type { Facets, ProductCard, ProductDetail } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { orderItems, orders } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import {
  createBrand,
  createCollection,
  createProduct,
  createTag,
  tagProduct,
} from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';

const app = makeTestApp();

interface ListBody {
  data: ProductCard[];
  meta: { total: number };
  facets: Facets;
}

async function list(query = '') {
  const res = await request(app).get(`/api/v1/products${query}`);
  return { res, body: bodyOf<ListBody>(res) };
}
const names = (b: ListBody) => b.data.map((p) => p.name);
const DAY = 24 * 3600 * 1000;

// A paid order for `quantity` units of a variant, to feed the bestseller aggregate.
async function sell(variantId: string, quantity: number, status: 'paid' | 'cancelled' = 'paid') {
  const [order] = await db
    .insert(orders)
    .values({
      email: 'buyer@x.test',
      status,
      subtotalCents: 1000 * quantity,
      shippingCents: 0,
      totalCents: 1000 * quantity,
      shippingMethodCode: 'standard',
      shippingMethodName: 'Standard',
      shippingAddress: { fullName: 'A', line1: '1', city: 'Riga', postalCode: '1', country: 'DE' },
      placedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error('order');
  await db.insert(orderItems).values({
    orderId: order.id,
    variantId,
    productName: 'x',
    variantName: 'x',
    sku: `S-${order.id}`,
    unitPriceCents: 1000,
    quantity,
    lineTotalCents: 1000 * quantity,
  });
}

describe('catalog list: brand, tag and collection filters', () => {
  it('filters by brand slug (OR within the filter) and counts brands in the facet', async () => {
    const a = await createBrand({ slug: 'alpha', name: 'Alpha' });
    const b = await createBrand({ slug: 'beta', name: 'Beta' });
    await createProduct({ name: 'One', brandId: a.id });
    await createProduct({ name: 'Two', brandId: a.id });
    await createProduct({ name: 'Three', brandId: b.id });
    await createProduct({ name: 'Unbranded' });

    expect(names((await list('?brand=alpha')).body).sort()).toEqual(['One', 'Two']);
    expect((await list('?brand=alpha,beta')).body.meta.total).toBe(3);
    expect((await list('?brand=nobody')).body.meta.total).toBe(0);

    // Facet counts ignore the brand filter itself, so the shopper can switch brand.
    const { facets } = (await list('?brand=beta')).body;
    expect(facets.brand).toEqual([
      { value: 'alpha', label: 'Alpha', count: 2 },
      { value: 'beta', label: 'Beta', count: 1 },
    ]);
  });

  it('puts the brand on the card and as the brand attribute', async () => {
    const a = await createBrand({ slug: 'alpha', name: 'Alpha' });
    await createProduct({ brandId: a.id });
    const [card] = (await list()).body.data;
    expect(card?.brand).toEqual({ slug: 'alpha', name: 'Alpha' });
    expect(card?.attributes.brand).toBe('Alpha');
  });

  it('filters by health-need tag and counts tags', async () => {
    const joints = await createTag({ slug: 'joints', name: 'Joints' });
    const dental = await createTag({ slug: 'dental', name: 'Dental' });
    const p1 = await createProduct({ name: 'Bed' });
    const p2 = await createProduct({ name: 'Chew' });
    await createProduct({ name: 'Ball' });
    await tagProduct(p1.product.id, joints.id);
    await tagProduct(p2.product.id, dental.id);
    await tagProduct(p2.product.id, joints.id);

    expect(names((await list('?tag=dental')).body)).toEqual(['Chew']);
    expect((await list('?tag=joints')).body.meta.total).toBe(2);
    expect((await list('?tag=joints,dental')).body.meta.total).toBe(2);
    const { facets } = (await list()).body;
    expect(facets.tag).toEqual([
      { value: 'joints', label: 'Joints', count: 2 },
      { value: 'dental', label: 'Dental', count: 1 },
    ]);
  });

  it('combines brand and tag with AND', async () => {
    const a = await createBrand({ slug: 'alpha' });
    const t = await createTag({ slug: 'joints' });
    const both = await createProduct({ name: 'Both', brandId: a.id });
    await createProduct({ name: 'BrandOnly', brandId: a.id });
    await tagProduct(both.product.id, t.id);
    expect(names((await list('?brand=alpha&tag=joints')).body)).toEqual(['Both']);
  });

  it('browses a live collection in the editor order, and nothing for one outside its window', async () => {
    const x = await createProduct({ name: 'X' });
    const y = await createProduct({ name: 'Y' });
    const z = await createProduct({ name: 'Z' });
    await createProduct({ name: 'Outsider' });
    await createCollection({ slug: 'live' }, [z.product.id, x.product.id, y.product.id]);
    await createCollection({ slug: 'ended', endsAt: new Date(Date.now() - DAY) }, [x.product.id]);
    await createCollection({ slug: 'soon', startsAt: new Date(Date.now() + DAY) }, [x.product.id]);
    await createCollection({ slug: 'off', isActive: false }, [x.product.id]);

    expect(names((await list('?collection=live')).body)).toEqual(['Z', 'X', 'Y']);
    // An explicit sort still wins over the collection order.
    expect(names((await list('?collection=live&sort=name')).body)).toEqual(['X', 'Y', 'Z']);
    for (const slug of ['ended', 'soon', 'off', 'missing'])
      expect((await list(`?collection=${slug}`)).body.meta.total, slug).toBe(0);
  });

  it('rejects an unknown badge with 400', async () => {
    expect((await list('?badge=shiny')).res.status).toBe(400);
  });
});

describe('catalog list: derived badges', () => {
  it('derives New, Sale, Eco and Low stock and lets the badge filter and facet use them', async () => {
    await createProduct({ name: 'Fresh', createdAt: new Date(Date.now() - 2 * DAY) });
    await createProduct({
      name: 'Marked',
      variants: [{ priceCents: 800, compareAtPriceCents: 1000 }],
    });
    await createProduct({ name: 'Green', isEco: true });
    await createProduct({ name: 'Scarce', variants: [{ stock: 3, lowStockThreshold: 5 }] });
    await createProduct({ name: 'Plain' });

    const { body } = await list('?sort=name');
    const badgesOf = (n: string) => body.data.find((p) => p.name === n)?.badges;
    expect(badgesOf('Fresh')).toEqual(['New']);
    expect(badgesOf('Marked')).toEqual(['Sale']);
    expect(badgesOf('Green')).toEqual(['Eco']);
    expect(badgesOf('Scarce')).toEqual(['Low stock']);
    expect(badgesOf('Plain')).toEqual([]);

    expect(names((await list('?badge=sale')).body)).toEqual(['Marked']);
    expect(names((await list('?badge=low-stock,eco&sort=name')).body)).toEqual(['Green', 'Scarce']);
    expect(body.facets.badge).toEqual(
      expect.arrayContaining([
        { value: 'sale', label: 'Sale', count: 1 },
        { value: 'new', label: 'New', count: 1 },
      ]),
    );
  });

  it('marks a manual override and the top sellers of paid orders as Bestseller', async () => {
    const hot = await createProduct({ name: 'Hot' });
    await createProduct({ name: 'Manual', isBestsellerOverride: true });
    const cancelled = await createProduct({ name: 'Cancelled sales' });
    for (let i = 0; i < 12; i++) await createProduct({ name: `Filler ${i}` });
    await sell(hot.variants[0]!.id, 5);
    await sell(cancelled.variants[0]!.id, 50, 'cancelled');

    const { body } = await list('?badge=bestseller&sort=name');
    // 15 products -> the top 10% is the 2 best sellers; the cancelled order does not count.
    expect(names(body)).toEqual(['Hot', 'Manual']);
  });

  it('does not count a pending order or an old paid one', async () => {
    const p = await createProduct({ name: 'Quiet' });
    await sell(p.variants[0]!.id, 9, 'cancelled');
    expect((await list('?badge=bestseller')).body.meta.total).toBe(0);
  });
});

describe('catalog list: unit price', () => {
  it('shows the default variant unit price in cents per kg or L, rounded half up', async () => {
    await createProduct({
      name: 'Food',
      variants: [{ priceCents: 599, netAmount: 150, netUnit: 'g' }],
    });
    await createProduct({
      name: 'Juice',
      variants: [{ priceCents: 999, netAmount: 500, netUnit: 'ml' }],
    });
    await createProduct({ name: 'Toy' });
    const { body } = await list('?sort=name');
    expect(body.data.map((p) => p.unitPrice)).toEqual([
      { cents: 3993, per: 'kg' },
      { cents: 1998, per: 'L' },
      null,
    ]);
  });

  it('sorts by unit price ascending with products that have none last', async () => {
    await createProduct({ name: 'Toy' });
    await createProduct({
      name: 'Pricey',
      variants: [{ priceCents: 1000, netAmount: 100, netUnit: 'g' }],
    });
    await createProduct({
      name: 'Cheap',
      variants: [{ priceCents: 500, netAmount: 1000, netUnit: 'g' }],
    });
    await createProduct({
      name: 'Middle',
      variants: [{ priceCents: 600, netAmount: 200, netUnit: 'g' }],
    });
    await createProduct({ name: 'Bed' });
    const { body } = await list('?sort=unit_price_asc');
    expect(names(body).slice(0, 3)).toEqual(['Cheap', 'Middle', 'Pricey']);
    expect(names(body).slice(3).sort()).toEqual(['Bed', 'Toy']);
  });

  it('breaks unit-price ties by price so pages are stable', async () => {
    await createProduct({
      name: 'A',
      variants: [{ priceCents: 200, netAmount: 100, netUnit: 'g' }],
    });
    await createProduct({
      name: 'B',
      variants: [{ priceCents: 100, netAmount: 50, netUnit: 'g' }],
    });
    const { body } = await list('?sort=unit_price_asc');
    expect(names(body)).toEqual(['B', 'A']);
  });

  it('keeps a trial size out of the price range and the price filter', async () => {
    await createProduct({
      name: 'Treats',
      variants: [
        { options: { pack: '150g' }, priceCents: 600, netAmount: 150, netUnit: 'g' },
        { options: { pack: 'trial' }, priceCents: 99, netAmount: 50, netUnit: 'g', isTrial: true },
      ],
    });
    const { body } = await list();
    expect(body.data[0]?.price).toMatchObject({ minCents: 600, maxCents: 600 });
    expect((await list('?maxPrice=200')).body.meta.total).toBe(0);
  });
});

describe('catalog list: swatches', () => {
  it('returns one swatch per colour with its own image when it has one', async () => {
    const { variants } = await createProduct({
      variants: [
        { options: { color: 'red', size: 'S' }, swatchHex: '#EF4444' },
        { options: { color: 'red', size: 'L' }, swatchHex: '#EF4444' },
        { options: { color: 'blue', size: 'S' }, swatchHex: '#3B82F6' },
      ],
      images: [{ url: '/p.webp' }, { url: '/blue.webp', variantIndex: 2 }],
    });
    expect(variants).toHaveLength(3);
    const [card] = (await list()).body.data;
    expect(card?.swatches.map((s) => [s.color, s.hex, s.image?.url ?? null])).toEqual([
      ['blue', '#3B82F6', '/blue.webp'],
      ['red', '#EF4444', null],
    ]);
  });

  it('returns no swatches for a product without colours', async () => {
    await createProduct();
    expect((await list()).body.data[0]?.swatches).toEqual([]);
  });
});

describe('GET /api/v1/products/:slug — depth fields', () => {
  it('returns brand, tags, badges and per-variant unit price and trial flag', async () => {
    const brand = await createBrand({ slug: 'alpha', name: 'Alpha' });
    const tag = await createTag({ slug: 'dental', name: 'Dental' });
    const { product } = await createProduct({
      slug: 'chews',
      brandId: brand.id,
      isEco: true,
      variants: [
        { options: { pack: '200g' }, priceCents: 700, netAmount: 200, netUnit: 'g' },
        { options: { pack: 'trial' }, priceCents: 99, netAmount: 50, netUnit: 'g', isTrial: true },
      ],
    });
    await tagProduct(product.id, tag.id);

    const res = await request(app).get('/api/v1/products/chews');
    const detail = bodyOf<{ data: ProductDetail }>(res).data;
    expect(detail.brand).toEqual({ slug: 'alpha', name: 'Alpha' });
    expect(detail.tags).toEqual([{ slug: 'dental', name: 'Dental' }]);
    expect(detail.badges).toEqual(['Eco']);
    // The sample does not set the "from" price.
    expect(detail.price).toMatchObject({ minCents: 700, maxCents: 700 });
    const trial = detail.variants.find((v) => v.isTrial);
    expect(trial).toMatchObject({ priceCents: 99, unitPrice: { cents: 1980, per: 'kg' } });
    expect(detail.variants.find((v) => !v.isTrial)?.unitPrice).toEqual({ cents: 3500, per: 'kg' });
  });
});
