import type { AdminCollection, AdminProduct, Brand, Collection, Tag } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createBrand, createCollection, createProduct, createTag } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';

const app = makeTestApp();
const DAY = 24 * 3600 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const get = (path: string) => request(app).get(`/api/v1${path}`);
const data = <T>(res: request.Response) => bodyOf<{ data: T }>(res).data;

describe('public brands', () => {
  it('lists brands with the count of active products and returns one by slug', async () => {
    const b = await createBrand({ slug: 'alpha', name: 'Alpha', tagline: 'Tag' });
    await createBrand({ slug: 'beta', name: 'Beta' });
    await createProduct({ brandId: b.id });
    await createProduct({ brandId: b.id });
    await createProduct({ brandId: b.id, status: 'draft' });

    const list = data<Brand[]>(await get('/brands'));
    expect(list.map((x) => [x.slug, x.productCount])).toEqual([
      ['alpha', 2],
      ['beta', 0],
    ]);
    const one = await get('/brands/alpha');
    expect(one.status).toBe(200);
    expect(data<Brand>(one)).toMatchObject({ name: 'Alpha', tagline: 'Tag', productCount: 2 });
    expect((await get('/brands/nope')).status).toBe(404);
  });

  it('is cacheable and sends no cookie', async () => {
    const res = await get('/brands');
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('public collections: the window rule', () => {
  it('serves a live collection and hides one that is off, not started or ended', async () => {
    const p = await createProduct();
    await createCollection({ slug: 'open' }, [p.product.id]);
    await createCollection({
      slug: 'inside',
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + DAY),
    });
    await createCollection({ slug: 'ended', endsAt: new Date(Date.now() - 1000) });
    await createCollection({ slug: 'soon', startsAt: new Date(Date.now() + DAY) });
    await createCollection({ slug: 'off', isActive: false });

    const live = data<Collection[]>(await get('/collections')).map((c) => c.slug);
    expect(live.sort()).toEqual(['inside', 'open']);
    expect((await get('/collections/open')).status).toBe(200);
    for (const slug of ['ended', 'soon', 'off', 'missing'])
      expect((await get(`/collections/${slug}`)).status, slug).toBe(404);
    expect(data<Collection>(await get('/collections/open')).productCount).toBe(1);
  });

  it('agrees with the SQL filter used by GET /products?collection=', async () => {
    const p = await createProduct();
    for (const [slug, patch] of [
      ['a', {}],
      ['b', { endsAt: new Date(Date.now() - DAY) }],
      ['c', { isActive: false }],
    ] as const) {
      await createCollection({ slug, ...patch }, [p.product.id]);
      const listed = (await get('/collections')).body as { data: Collection[] };
      const viaApi = listed.data.some((c) => c.slug === slug);
      const viaFilter = bodyOf<{ meta: { total: number } }>(
        await get(`/products?collection=${slug}`),
      ).meta.total;
      expect(viaFilter > 0, slug).toBe(viaApi);
    }
  });
});

describe('public tags', () => {
  it('lists tags with counts', async () => {
    await createTag({ slug: 'joints', name: 'Joints' });
    expect(data<Tag[]>(await get('/tags'))[0]).toMatchObject({ slug: 'joints', productCount: 0 });
  });
});

describe('admin: access', () => {
  it('refuses a customer on every write', async () => {
    const customer = await signedIn(app, 'customer');
    const res = await customer.shopper.call('post', '/admin/brands', { slug: 'x', name: 'X' });
    expect(res.status).toBe(403);
    expect((await customer.shopper.call('post', '/admin/collections', {})).status).toBe(403);
  });
});

describe('admin: brands', () => {
  it('creates, renames, refuses a duplicate slug and deletes without deleting products', async () => {
    const admin = await signedIn(app, 'admin');
    const created = await admin.shopper.call('post', '/admin/brands', {
      slug: 'gamma',
      name: 'Gamma',
      accentColor: '#112233',
    });
    expect(created.status).toBe(201);
    const brand = data<Brand>(created);

    const dup = await admin.shopper.call('post', '/admin/brands', { slug: 'gamma', name: 'Other' });
    expect(dup.status).toBe(409);
    expect(errorOf(dup).code).toBe('CONFLICT');
    expect(
      (await admin.shopper.call('post', '/admin/brands', { slug: 'Bad Slug', name: 'X' })).status,
    ).toBe(400);

    const patched = await admin.shopper.call('patch', `/admin/brands/${brand.id}`, {
      name: 'Gamma Ltd',
      story: 'Hi',
    });
    expect(data<Brand>(patched)).toMatchObject({ slug: 'gamma', name: 'Gamma Ltd', story: 'Hi' });
    // The slug cannot be changed through PATCH (unknown keys are dropped, the slug stays).
    const sneaky = await admin.shopper.call('patch', `/admin/brands/${brand.id}`, {
      name: 'Gamma Ltd',
      slug: 'moved',
    });
    expect(data<Brand>(sneaky).slug).toBe('gamma');

    const { product } = await createProduct({ brandId: brand.id });
    expect((await admin.shopper.call('delete', `/admin/brands/${brand.id}`)).status).toBe(204);
    const after = data<AdminProduct>(
      await admin.shopper.call('get', `/admin/products/${product.id}`),
    );
    expect(after.brandId).toBeNull();
    expect((await admin.shopper.call('delete', `/admin/brands/${brand.id}`)).status).toBe(404);
  });
});

describe('admin: collections', () => {
  it('validates the window, orders products and refuses a duplicate slug', async () => {
    const admin = await signedIn(app, 'admin');
    const bad = await admin.shopper.call('post', '/admin/collections', {
      slug: 'bad',
      name: 'Bad',
      startsAt: iso(2),
      endsAt: iso(1),
    });
    expect(bad.status).toBe(400);

    const res = await admin.shopper.call('post', '/admin/collections', {
      slug: 'winter',
      name: 'Winter',
      startsAt: iso(-1),
      endsAt: iso(5),
    });
    expect(res.status).toBe(201);
    const collection = data<AdminCollection>(res);
    expect(collection).toMatchObject({ isLive: true, isActive: true, productCount: 0 });
    expect(
      (await admin.shopper.call('post', '/admin/collections', { slug: 'winter', name: 'Again' }))
        .status,
    ).toBe(409);

    // Moving only the end before the stored start is a window error too.
    const early = await admin.shopper.call('patch', `/admin/collections/${collection.id}`, {
      endsAt: iso(-3),
    });
    expect(early.status).toBe(400);

    const a = await createProduct({ name: 'A' });
    const b = await createProduct({ name: 'B' });
    const c = await createProduct({ name: 'C' });
    const order = [c.product.id, a.product.id, b.product.id];
    const set = await admin.shopper.call('put', `/admin/collections/${collection.id}/products`, {
      productIds: order,
    });
    expect(data<AdminCollection>(set).productIds).toEqual(order);
    expect(data<AdminCollection>(set).products.map((p) => p.name)).toEqual(['C', 'A', 'B']);
    // Reordering replaces the list.
    const swapped = [b.product.id, c.product.id];
    const second = await admin.shopper.call('put', `/admin/collections/${collection.id}/products`, {
      productIds: swapped,
    });
    expect(data<AdminCollection>(second).productIds).toEqual(swapped);
    const dupes = await admin.shopper.call('put', `/admin/collections/${collection.id}/products`, {
      productIds: [a.product.id, a.product.id],
    });
    expect(dupes.status).toBe(400);
    const unknown = await admin.shopper.call(
      'put',
      `/admin/collections/${collection.id}/products`,
      { productIds: ['11111111-1111-4111-8111-111111111111'] },
    );
    expect(unknown.status).toBe(400);

    // The public listing follows the saved order.
    const listed = bodyOf<{ data: { name: string }[] }>(await get('/products?collection=winter'));
    expect(listed.data.map((p) => p.name)).toEqual(['B', 'C']);

    // Switching it off hides it publicly but keeps it in the admin list.
    const off = await admin.shopper.call('patch', `/admin/collections/${collection.id}`, {
      isActive: false,
    });
    expect(data<AdminCollection>(off).isLive).toBe(false);
    expect((await get('/collections/winter')).status).toBe(404);
    const all = data<AdminCollection[]>(await admin.shopper.call('get', '/admin/collections'));
    expect(all.map((x) => x.slug)).toContain('winter');

    expect((await admin.shopper.call('delete', `/admin/collections/${collection.id}`)).status).toBe(
      204,
    );
    expect((await admin.shopper.call('get', `/admin/collections/${collection.id}`)).status).toBe(
      404,
    );
  });
});

describe('admin: tags and product flags', () => {
  it('manages tags and sets them on a product', async () => {
    const admin = await signedIn(app, 'admin');
    const t = data<Tag>(
      await admin.shopper.call('post', '/admin/tags', { slug: 'calming', name: 'Calming' }),
    );
    expect(
      (await admin.shopper.call('post', '/admin/tags', { slug: 'calming', name: 'Dup' })).status,
    ).toBe(409);
    expect(
      data<Tag>(await admin.shopper.call('patch', `/admin/tags/${t.id}`, { name: 'Calm' })).name,
    ).toBe('Calm');

    const { product } = await createProduct();
    const set = await admin.shopper.call('put', `/admin/products/${product.id}/tags`, {
      tagIds: [t.id],
    });
    expect(data<{ slug: string }[]>(set).map((x) => x.slug)).toEqual(['calming']);
    expect(
      (
        await admin.shopper.call('put', `/admin/products/${product.id}/tags`, {
          tagIds: ['11111111-1111-4111-8111-111111111111'],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.shopper.call(
          'put',
          '/admin/products/11111111-1111-4111-8111-111111111111/tags',
          { tagIds: [] },
        )
      ).status,
    ).toBe(404);

    const full = data<AdminProduct>(
      await admin.shopper.call('get', `/admin/products/${product.id}`),
    );
    expect(full.tags.map((x) => x.slug)).toEqual(['calming']);
    expect(data<Tag[]>(await get('/tags'))[0]?.productCount).toBe(1);

    expect((await admin.shopper.call('delete', `/admin/tags/${t.id}`)).status).toBe(204);
    expect(
      data<AdminProduct>(await admin.shopper.call('get', `/admin/products/${product.id}`)).tags,
    ).toEqual([]);
  });

  it('sets the brand, eco flag, bestseller override and new-until date on a product', async () => {
    const admin = await signedIn(app, 'admin');
    const brand = await createBrand();
    const { product } = await createProduct();
    const res = await admin.shopper.call('patch', `/admin/products/${product.id}`, {
      brandId: brand.id,
      isEco: true,
      isBestsellerOverride: true,
      badgeNewUntil: iso(10),
    });
    expect(res.status).toBe(200);
    expect(data<AdminProduct>(res)).toMatchObject({
      brandId: brand.id,
      isEco: true,
      isBestsellerOverride: true,
    });
    const card = bodyOf<{ data: { badges: string[] }[] }>(await get('/products')).data[0];
    expect(card?.badges).toEqual(['Bestseller', 'New', 'Eco']);

    const unknown = await admin.shopper.call('patch', `/admin/products/${product.id}`, {
      brandId: '11111111-1111-4111-8111-111111111111',
    });
    expect(unknown.status).toBe(400);
    const cleared = await admin.shopper.call('patch', `/admin/products/${product.id}`, {
      brandId: null,
      badgeNewUntil: null,
    });
    expect(data<AdminProduct>(cleared)).toMatchObject({ brandId: null, badgeNewUntil: null });
  });

  it('accepts net amount, trial flag and swatch on a variant and refuses a lonely amount', async () => {
    const admin = await signedIn(app, 'admin');
    const { product, variants } = await createProduct();
    const id = variants[0]?.id ?? '';
    const ok = await admin.shopper.call('patch', `/admin/variants/${id}`, {
      netAmount: 150,
      netUnit: 'g',
      isTrial: true,
      swatchHex: '#AABBCC',
    });
    expect(ok.status).toBe(200);
    expect(data<{ netAmount: number; isTrial: boolean }>(ok)).toMatchObject({
      netAmount: 150,
      isTrial: true,
    });
    expect(
      (await admin.shopper.call('patch', `/admin/variants/${id}`, { netAmount: 150 })).status,
    ).toBe(400);
    expect(
      (await admin.shopper.call('patch', `/admin/variants/${id}`, { swatchHex: 'red' })).status,
    ).toBe(400);
    expect(product.id).toBeTruthy();
  });
});
