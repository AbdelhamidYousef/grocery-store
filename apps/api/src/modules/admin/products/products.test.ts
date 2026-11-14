import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../../db/client.ts';
import {
  cartItems,
  inventory,
  inventoryAdjustments,
  productVariants,
  products,
} from '../../../db/schema/index.ts';
import { makeTestApp } from '../../../test/app.ts';
import {
  createCart,
  createCategory,
  createProduct,
  createShippingMethods,
} from '../../../test/factories.ts';
import { FakeStripe } from '../../../test/fake-stripe.ts';
import { bodyOf, errorOf } from '../../../test/http.ts';
import { placeOrder, signedIn, stockOf } from '../../../test/orders.ts';
import type { Shopper } from '../../../test/shopper.ts';

const app = makeTestApp({ payments: new FakeStripe() });

let admin: { shopper: Shopper; user: { id: string; email: string } };
let categoryId: string;

beforeEach(async () => {
  admin = await signedIn(app, 'admin', 'boss@grocery.test');
  categoryId = (await createCategory()).id;
  await createShippingMethods();
});

interface Variant {
  id: string;
  sku: string;
  isDefault: boolean;
  quantity: number;
  available: number;
  updatedAt: string;
}
interface Product {
  id: string;
  slug: string;
  status: string;
  updatedAt: string;
  variants: Variant[];
  images: { url: string; variantId: string | null; sortOrder: number }[];
}
const data = <T>(res: { body: unknown }) => bodyOf<{ data: T }>(res as never).data;

const variant = (over: Record<string, unknown> = {}) => ({
  sku: 'PW-ROPE-RED-L',
  name: 'Red · Large',
  options: { color: 'red', size: 'L' },
  priceCents: 1299,
  weightGrams: 250,
  stock: 10,
  ...over,
});
const newProduct = (over: Record<string, unknown> = {}) => ({
  name: 'Rope Toy',
  description: 'A chewy rope.',
  categoryId,
  status: 'active',
  variants: [variant()],
  ...over,
});
const post = (path: string, body: object) => admin.shopper.call('post', path, body);
const patch = (path: string, body: object) => admin.shopper.call('patch', path, body);

async function created(over: Record<string, unknown> = {}) {
  const res = await post('/admin/products', newProduct(over));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return data<Product>(res);
}

describe('POST /admin/products', () => {
  it('creates a product with variants, stock and images in one go and generates the slug', async () => {
    const product = await created({
      variants: [
        variant(),
        variant({ sku: 'PW-ROPE-BLUE-L', options: { color: 'blue', size: 'L' }, stock: 0 }),
      ],
      images: [
        { url: '/products/rope-1.webp', alt: 'Rope', width: 800, height: 800 },
        {
          url: 'https://cdn.example.com/rope-blue.jpg',
          alt: 'Blue rope',
          width: 800,
          height: 800,
          variantSku: 'PW-ROPE-BLUE-L',
        },
      ],
    });
    expect(product.slug).toBe('rope-toy');
    expect(product.variants.map((v) => [v.sku, v.isDefault])).toEqual([
      ['PW-ROPE-RED-L', true],
      ['PW-ROPE-BLUE-L', false],
    ]);
    expect(product.images.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(product.images[1]?.variantId).toBe(product.variants[1]?.id);

    // Opening stock is logged; zero stock needs no entry.
    const adjustments = await db.select().from(inventoryAdjustments);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      delta: 10,
      reason: 'restock',
      actor: 'admin:boss@grocery.test',
    });
  });

  it('adds a numeric suffix when the generated slug is taken', async () => {
    await created();
    expect(
      (await created({ variants: [variant({ sku: 'OTHER-1', options: { a: '1' } })] })).slug,
    ).toBe('rope-toy-2');
  });

  it('shows an active product in the public catalog and hides a draft', async () => {
    const live = await created({ name: 'Live one' });
    const draft = await created({
      name: 'Draft one',
      status: 'draft',
      variants: [variant({ sku: 'D-1', options: { a: '1' } })],
    });
    const publicApp = makeTestApp();
    const { default: request } = await import('supertest');
    expect((await request(publicApp).get(`/api/v1/products/${live.slug}`)).status).toBe(200);
    expect((await request(publicApp).get(`/api/v1/products/${draft.slug}`)).status).toBe(404);
  });

  it('answers 409 for a SKU used elsewhere and creates nothing', async () => {
    await created();
    const before = await db.select().from(products);
    const res = await post(
      '/admin/products',
      newProduct({ name: 'Second', variants: [variant({ options: { x: '1' } })] }),
    );
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('CONFLICT');
    expect(await db.select().from(products)).toHaveLength(before.length); // whole transaction rolled back
  });

  it('rejects duplicate SKUs inside one request, two defaults and unknown categories with 400', async () => {
    const dup = await post(
      '/admin/products',
      newProduct({ variants: [variant(), variant({ options: { x: '1' } })] }),
    );
    expect(dup.status).toBe(400);
    const twoDefaults = await post(
      '/admin/products',
      newProduct({
        variants: [
          variant({ isDefault: true }),
          variant({ sku: 'B', options: { x: '1' }, isDefault: true }),
        ],
      }),
    );
    expect(twoDefaults.status).toBe(400);
    const noCategory = await post(
      '/admin/products',
      newProduct({ categoryId: '11111111-1111-4111-8111-111111111111' }),
    );
    expect(noCategory.status).toBe(400);
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it('validates money, weights, strike-through price and image URLs', async () => {
    const bad = async (over: Record<string, unknown>) =>
      (await post('/admin/products', newProduct(over))).status;
    expect(await bad({ variants: [variant({ priceCents: -1 })] })).toBe(400);
    expect(await bad({ variants: [variant({ priceCents: 12.5 })] })).toBe(400);
    expect(await bad({ variants: [variant({ weightGrams: 0 })] })).toBe(400);
    expect(await bad({ variants: [variant({ compareAtPriceCents: 1000 })] })).toBe(400);
    expect(await bad({ variants: [] })).toBe(400);
    for (const url of [
      'javascript:alert(1)',
      '//evil.com/x.png',
      '/products/../secret',
      'http://x.com/a.png',
      'data:image/png;base64,AAAA',
      '/other/x.png',
    ]) {
      expect(await bad({ images: [{ url, alt: 'x', width: 1, height: 1 }] }), url).toBe(400);
    }
    expect(await bad({ images: [{ url: '/products/a.webp', alt: '', width: 1, height: 1 }] })).toBe(
      400,
    );
  });

  it('keeps variants on the product option schema when optionKeys is set', async () => {
    const res = await post(
      '/admin/products',
      newProduct({
        attributes: { optionKeys: ['color', 'size'] },
        variants: [variant({ options: { color: 'red' } })],
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /admin/products', () => {
  it('lists every status, paginated, and filters by q (name, slug, SKU) and status', async () => {
    await created({ name: 'Alpha rope' });
    await created({
      name: 'Beta ball',
      status: 'draft',
      variants: [variant({ sku: 'BALL-9', options: { a: '1' } })],
    });
    await createProduct({ name: 'Gamma 50% off', status: 'archived' });

    const all = await admin.shopper.call('get', '/admin/products?limit=2');
    const body = bodyOf<{
      data: { name: string; variantCount: number }[];
      meta: { total: number; totalPages: number };
    }>(all);
    expect(body.meta).toMatchObject({ total: 3, totalPages: 2, page: 1, limit: 2 });
    expect(body.data).toHaveLength(2);

    const byName = bodyOf<{ data: { name: string }[] }>(
      await admin.shopper.call('get', '/admin/products?q=alpha'),
    );
    expect(byName.data.map((p) => p.name)).toEqual(['Alpha rope']);
    const bySku = bodyOf<{ data: { name: string }[] }>(
      await admin.shopper.call('get', '/admin/products?q=ball-9'),
    );
    expect(bySku.data.map((p) => p.name)).toEqual(['Beta ball']);
    const percent = bodyOf<{ data: { name: string }[] }>(
      await admin.shopper.call('get', '/admin/products?q=%25'),
    );
    expect(percent.data.map((p) => p.name)).toEqual(['Gamma 50% off']);
    const drafts = bodyOf<{ data: { name: string }[] }>(
      await admin.shopper.call('get', '/admin/products?status=draft'),
    );
    expect(drafts.data.map((p) => p.name)).toEqual(['Beta ball']);
  });

  it('shows price range and available stock per product', async () => {
    await created({
      variants: [
        variant({ stock: 4 }),
        variant({ sku: 'B', options: { x: '1' }, priceCents: 2000, stock: 6 }),
      ],
    });
    const res = await admin.shopper.call('get', '/admin/products');
    expect(bodyOf<{ data: object[] }>(res).data[0]).toMatchObject({
      variantCount: 2,
      minPriceCents: 1299,
      maxPriceCents: 2000,
      availableStock: 10,
    });
  });

  it('rejects a limit above the cap', async () => {
    expect((await admin.shopper.call('get', '/admin/products?limit=500')).status).toBe(400);
  });
});

describe('PATCH /admin/products/:id', () => {
  it('updates fields, bumps updated_at, and cannot change the slug', async () => {
    const product = await created();
    await new Promise((r) => setTimeout(r, 15));
    const res = await patch(`/admin/products/${product.id}`, {
      name: 'Better rope',
      status: 'draft',
      slug: 'hacked',
    });
    expect(res.status).toBe(200);
    const updated = data<Product & { name: string }>(res);
    expect(updated).toMatchObject({ name: 'Better rope', status: 'draft', slug: 'rope-toy' });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(product.updatedAt).getTime(),
    );
  });

  it('replaces the image list (reorder, remove, add) and bumps updated_at for an image-only edit', async () => {
    const product = await created({
      images: [
        { url: '/products/a.webp', alt: 'A', width: 1, height: 1 },
        { url: '/products/b.webp', alt: 'B', width: 1, height: 1 },
      ],
    });
    await new Promise((r) => setTimeout(r, 15));
    const res = await patch(`/admin/products/${product.id}`, {
      images: [
        { url: '/products/b.webp', alt: 'B', width: 1, height: 1 },
        { url: '/products/c.webp', alt: 'C', width: 1, height: 1, variantSku: 'PW-ROPE-RED-L' },
      ],
    });
    const updated = data<Product>(res);
    expect(updated.images.map((i) => i.url)).toEqual(['/products/b.webp', '/products/c.webp']);
    expect(updated.images[1]?.variantId).toBe(product.variants[0]?.id);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(product.updatedAt).getTime(),
    );

    const unknownSku = await patch(`/admin/products/${product.id}`, {
      images: [{ url: '/products/c.webp', alt: 'C', width: 1, height: 1, variantSku: 'NOPE' }],
    });
    expect(unknownSku.status).toBe(400);
  });

  it('answers 404 for an unknown product and 400 for an empty patch or a bad id', async () => {
    const missing = '11111111-1111-4111-8111-111111111111';
    expect((await patch(`/admin/products/${missing}`, { name: 'x' })).status).toBe(404);
    expect((await admin.shopper.call('get', `/admin/products/${missing}`)).status).toBe(404);
    const product = await created();
    expect((await patch(`/admin/products/${product.id}`, {})).status).toBe(400);
    expect((await patch('/admin/products/not-a-uuid', { name: 'x' })).status).toBe(400);
  });
});

describe('variants', () => {
  it('adds a variant with stock, demotes the default when asked, and rejects a duplicate SKU with 409', async () => {
    const product = await created();
    const add = await post(
      `/admin/products/${product.id}/variants`,
      variant({ sku: 'NEW-1', options: { x: '1' }, isDefault: true, stock: 3 }),
    );
    expect(add.status).toBe(201);
    expect(data<Variant>(add)).toMatchObject({
      sku: 'NEW-1',
      isDefault: true,
      quantity: 3,
      available: 3,
    });
    const refreshed = data<Product>(
      await admin.shopper.call('get', `/admin/products/${product.id}`),
    );
    expect(refreshed.variants.filter((v) => v.isDefault)).toHaveLength(1);

    const dup = await post(
      `/admin/products/${product.id}/variants`,
      variant({ sku: 'new-1', options: { x: '2' } }),
    );
    expect(dup.status).toBe(409);
    const dupOptions = await post(
      `/admin/products/${product.id}/variants`,
      variant({ sku: 'NEW-2', options: { x: '1' } }),
    );
    expect(dupOptions.status).toBe(409);
  });

  it('updates price, SKU and status, and keeps exactly one default', async () => {
    const product = await created({
      variants: [variant(), variant({ sku: 'B', options: { x: '1' } })],
    });
    const [first, second] = product.variants as [Variant, Variant];
    const res = await patch(`/admin/variants/${second.id}`, {
      priceCents: 999,
      sku: 'B2',
      isDefault: true,
      status: 'archived',
    });
    expect(res.status).toBe(200);
    expect(data<Variant>(res)).toMatchObject({ sku: 'B2', isDefault: true });
    const refreshed = data<Product>(
      await admin.shopper.call('get', `/admin/products/${product.id}`),
    );
    expect(refreshed.variants.find((v) => v.id === first.id)?.isDefault).toBe(false);

    expect((await patch(`/admin/variants/${second.id}`, { isDefault: false })).status).toBe(400);
    expect((await patch(`/admin/variants/${first.id}`, { sku: 'b2' })).status).toBe(409);
    expect((await patch(`/admin/variants/${first.id}`, { compareAtPriceCents: 100 })).status).toBe(
      400,
    );
  });

  it('deletes a variant, promotes a new default, and removes it from carts', async () => {
    const product = await created({
      variants: [variant(), variant({ sku: 'B', options: { x: '1' } })],
    });
    const [first, second] = product.variants as [Variant, Variant];
    await createCart({ items: [{ variantId: first.id, quantity: 1 }] });
    expect((await admin.shopper.call('delete', `/admin/variants/${first.id}`)).status).toBe(204);

    expect(await db.select().from(cartItems)).toHaveLength(0);
    const refreshed = data<Product>(
      await admin.shopper.call('get', `/admin/products/${product.id}`),
    );
    expect(refreshed.variants.map((v) => [v.id, v.isDefault])).toEqual([[second.id, true]]);
  });

  it('refuses to delete the last variant, or one reserved by an unpaid order', async () => {
    const only = await created();
    expect(
      (await admin.shopper.call('delete', `/admin/variants/${only.variants[0]!.id}`)).status,
    ).toBe(409);

    const shared = await createProduct({ variants: [{ stock: 5 }, { stock: 5 }] });
    await placeOrder(app, { variantId: shared.variants[0]!.id, quantity: 2 });
    const res = await admin.shopper.call('delete', `/admin/variants/${shared.variants[0]!.id}`);
    expect(res.status).toBe(409);
    expect(errorOf(res).message).toMatch(/archive/);
    expect(
      await db.select().from(productVariants).where(eq(productVariants.id, shared.variants[0]!.id)),
    ).toHaveLength(1);
  });
});

describe('PATCH /admin/inventory/:variantId', () => {
  it('sets an absolute quantity with a reason and records the delta and the admin', async () => {
    const product = await created();
    const id = product.variants[0]!.id;
    const res = await patch(`/admin/inventory/${id}`, {
      quantity: 25,
      reason: 'restock',
      note: 'Delivery #4',
    });
    expect(res.status).toBe(200);
    expect(data<object>(res)).toEqual({
      variantId: id,
      quantity: 25,
      reserved: 0,
      available: 25,
      delta: 15,
    });

    await patch(`/admin/inventory/${id}`, { quantity: 20, reason: 'damage' });
    const log = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.variantId, id));
    expect(log.map((l) => [l.delta, l.reason]).sort()).toEqual(
      [
        [-5, 'damage'],
        [10, 'restock'],
        [15, 'restock'],
      ].sort(),
    );
    expect(log.find((l) => l.note === 'Delivery #4')?.actor).toBe('admin:boss@grocery.test');
  });

  it('records nothing when the count already matches', async () => {
    const product = await created();
    const res = await patch(`/admin/inventory/${product.variants[0]!.id}`, {
      quantity: 10,
      reason: 'correction',
    });
    expect(data<{ delta: number }>(res).delta).toBe(0);
    expect(await db.select().from(inventoryAdjustments)).toHaveLength(1); // only the opening stock
  });

  it('rejects a quantity below what unpaid orders have reserved, and changes nothing', async () => {
    const { variants } = await createProduct({ variants: [{ stock: 10 }] });
    const { variantId } = await placeOrder(app, { variantId: variants[0]!.id, quantity: 4 });
    const res = await patch(`/admin/inventory/${variantId}`, { quantity: 3, reason: 'correction' });
    expect(res.status).toBe(409);
    expect(errorOf(res).details).toEqual({ reserved: 4 });
    expect(await stockOf(variantId)).toEqual({ quantity: 10, reserved: 4 });

    const ok = await patch(`/admin/inventory/${variantId}`, { quantity: 4, reason: 'correction' });
    expect(data<{ available: number }>(ok).available).toBe(0);
  });

  it('validates the body and the variant', async () => {
    const product = await created();
    const id = product.variants[0]!.id;
    expect(
      (await patch(`/admin/inventory/${id}`, { quantity: -1, reason: 'correction' })).status,
    ).toBe(400);
    expect(
      (await patch(`/admin/inventory/${id}`, { quantity: 1.5, reason: 'correction' })).status,
    ).toBe(400);
    expect((await patch(`/admin/inventory/${id}`, { quantity: 1, reason: 'because' })).status).toBe(
      400,
    );
    expect((await patch(`/admin/inventory/${id}`, { quantity: 1 })).status).toBe(400);
    expect(
      (
        await patch('/admin/inventory/11111111-1111-4111-8111-111111111111', {
          quantity: 1,
          reason: 'correction',
        })
      ).status,
    ).toBe(404);
    expect(
      (await db.select().from(inventory).where(eq(inventory.variantId, id)))[0]?.quantity,
    ).toBe(10);
  });

  it('bumps the inventory row updated_at (audit-friendly)', async () => {
    const product = await created();
    const id = product.variants[0]!.id;
    const [before] = await db.select().from(inventory).where(eq(inventory.variantId, id));
    await new Promise((r) => setTimeout(r, 15));
    await patch(`/admin/inventory/${id}`, { quantity: 11, reason: 'correction' });
    const [after] = await db.select().from(inventory).where(eq(inventory.variantId, id));
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });
});
