import { rm } from 'node:fs/promises';

import sharp from 'sharp';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { makeTestApp, TEST_ORIGIN, TEST_UPLOAD_DIR } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';

const app = makeTestApp();

afterAll(async () => {
  await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});

type PublicPhoto = {
  id: string;
  path: string;
  caption: string;
  products: { id: string; slug: string; variantId: string | null; inStock: boolean }[];
};
const publicList = async (q = '') =>
  bodyOf<{ data: PublicPhoto[] }>(await request(app).get(`/api/v1/gallery${q}`)).data;

describe('admin gallery', () => {
  it('is closed to customers', async () => {
    const { shopper } = await signedIn(app, 'customer');
    expect((await shopper.call('get', '/admin/gallery')).status).toBe(403);
    expect((await shopper.call('post', '/admin/gallery', { path: '/reviews/a.webp' })).status).toBe(
      403,
    );
  });

  it('creates, updates, links products and deletes', async () => {
    const a = await createProduct();
    const b = await createProduct();
    const { shopper } = await signedIn(app, 'admin');
    const created = await shopper.call('post', '/admin/gallery', {
      path: '/reviews/biscuit.webp',
      caption: 'Biscuit and his bed',
      petName: 'Biscuit',
      sortOrder: 2,
      published: true,
      productIds: [a.product.id],
    });
    expect(created.status).toBe(201);
    const id = bodyOf<{ data: { id: string; productIds: string[] } }>(created).data.id;

    const patched = await shopper.call('patch', `/admin/gallery/${id}`, {
      caption: 'Updated',
      productIds: [a.product.id, b.product.id],
    });
    expect(bodyOf<{ data: { caption: string; productIds: string[] } }>(patched).data).toMatchObject(
      {
        caption: 'Updated',
      },
    );
    expect(bodyOf<{ data: { productIds: string[] } }>(patched).data.productIds).toHaveLength(2);
    const list = await shopper.call('get', '/admin/gallery');
    expect(bodyOf<{ data: unknown[] }>(list).data).toHaveLength(1);

    expect((await shopper.call('delete', `/admin/gallery/${id}`)).status).toBe(204);
    expect((await shopper.call('delete', `/admin/gallery/${id}`)).status).toBe(404);
  });

  it('refuses a full URL, a protocol-relative path and an unknown product', async () => {
    const { shopper } = await signedIn(app, 'admin');
    for (const path of [
      'https://evil.example/x.jpg',
      '//evil.example/x.jpg',
      '/\\evil.example/x.jpg',
      'x.jpg',
    ]) {
      expect((await shopper.call('post', '/admin/gallery', { path })).status).toBe(400);
    }
    const res = await shopper.call('post', '/admin/gallery', {
      path: '/reviews/a.webp',
      productIds: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(res.status).toBe(400);
    expect(errorOf(res).message).toMatch(/Unknown product/);
  });

  it('uploads a photo through the same pipeline and returns its path', async () => {
    const { shopper } = await signedIn(app, 'admin');
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const res = await request(app)
      .post('/api/v1/admin/gallery/upload')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', `sid=${shopper.jar.get('sid')}`)
      .attach('photo', png, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const path = bodyOf<{ data: { path: string } }>(res).data.path;
    expect(path).toMatch(/^\/api\/v1\/uploads\/gallery\/[0-9a-f-]{36}\.webp$/);
    expect((await request(app).get(path)).status).toBe(200);
    const none = await request(app)
      .post('/api/v1/admin/gallery/upload')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', `sid=${shopper.jar.get('sid')}`);
    expect(none.status).toBe(400);
  });
});

describe('public gallery', () => {
  it('shows only published photos, ordered, with buyable products', async () => {
    const a = await createProduct({
      name: 'Cloud Bed',
      variants: [{ priceCents: 4500, stock: 3 }],
    });
    const sold = await createProduct({ variants: [{ stock: 0 }] });
    const draft = await createProduct({ status: 'draft' });
    const { shopper } = await signedIn(app, 'admin');
    const mk = (body: object) => shopper.call('post', '/admin/gallery', body);
    await mk({
      path: '/reviews/two.webp',
      sortOrder: 2,
      published: true,
      productIds: [a.product.id],
    });
    await mk({
      path: '/reviews/one.webp',
      sortOrder: 1,
      published: true,
      productIds: [sold.product.id, draft.product.id],
    });
    await mk({ path: '/reviews/hidden.webp', published: false, productIds: [a.product.id] });

    const list = await publicList();
    expect(list.map((p) => p.path)).toEqual(['/reviews/one.webp', '/reviews/two.webp']);
    // The draft product is not offered; the sold-out one is shown but cannot be added.
    expect(list[0]?.products).toHaveLength(1);
    expect(list[0]?.products[0]).toMatchObject({ inStock: false, variantId: null });
    expect(list[1]?.products[0]).toMatchObject({ slug: a.product.slug, inStock: true });
    expect(list[1]?.products[0]?.variantId).toBe(a.variants[0]!.id);
  });

  it('filters by product and is publicly cacheable', async () => {
    const a = await createProduct();
    const b = await createProduct();
    const { shopper } = await signedIn(app, 'admin');
    await shopper.call('post', '/admin/gallery', {
      path: '/reviews/a.webp',
      published: true,
      productIds: [a.product.id],
    });
    await shopper.call('post', '/admin/gallery', {
      path: '/reviews/b.webp',
      published: true,
      productIds: [b.product.id],
    });
    expect((await publicList(`?productId=${a.product.id}`)).map((p) => p.path)).toEqual([
      '/reviews/a.webp',
    ]);
    expect((await request(app).get('/api/v1/gallery')).headers['cache-control']).toMatch(/public/);
    expect((await request(app).get('/api/v1/gallery?productId=nope')).status).toBe(400);
  });
});
