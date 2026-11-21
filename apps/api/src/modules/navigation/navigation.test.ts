import type { Navigation } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { menuPromos } from '../../db/schema/index.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createBrand, createCategory, createProduct, createUser } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { createSession } from '../auth/sessions.ts';

const app = makeTestApp();

async function nav() {
  const res = await request(app).get('/api/v1/navigation');
  return { res, data: bodyOf<{ data: Navigation }>(res).data };
}

async function asAdmin() {
  const user = await createUser({ role: 'admin' });
  const { token } = await createSession(user.id);
  return (method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) => {
    const req = request(app)[method](`/api/v1${path}`).set('Cookie', `sid=${token}`);
    if (method !== 'get') req.set('Origin', TEST_ORIGIN);
    return body ? req.send(body) : req;
  };
}

const promo = {
  categoryId: null as string | null,
  title: 'Fresh this week',
  subtitle: 'Berries and herbs',
  imageUrl: '/products/placeholders/fruit-veg.svg',
  imageAlt: 'An apple icon',
  link: '/c/fruit',
};

describe('GET /navigation', () => {
  it('builds a panel per department from the category tree, brands and promos, publicly cacheable', async () => {
    const dairy = await createCategory({ slug: 'dairy-eggs', name: 'Dairy & eggs' });
    const cheese = await createCategory({ slug: 'cheese-x', name: 'Cheese', parentId: dairy.id });
    const brand = await createBrand({ name: 'Meadowtest' });
    await createProduct({ categoryId: cheese.id, brandId: brand.id });
    await db.insert(menuPromos).values({ ...promo, categoryId: dairy.id, sortOrder: 0 });

    const { res, data } = await nav();
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
    expect(res.headers['set-cookie']).toBeUndefined();
    const panel = data.departments.find((d) => d.slug === 'dairy-eggs');
    expect(panel).toMatchObject({
      name: 'Dairy & eggs',
      categories: [{ slug: 'cheese-x', name: 'Cheese', productCount: 1 }],
      brands: [{ name: 'Meadowtest' }],
      promo: { title: 'Fresh this week', link: '/c/fruit' },
    });
    // A department with no top-level category has no panel.
    expect(data.departments.find((d) => d.slug === 'bakery')).toBeUndefined();
  });

  it('shows a department its own promo, else the first "any department" one, and never an inactive promo', async () => {
    await createCategory({ slug: 'bakery', name: 'Bakery' });
    const frozen = await createCategory({ slug: 'frozen', name: 'Frozen' });
    await db.insert(menuPromos).values([
      { ...promo, title: 'Hidden bakery', active: false, sortOrder: 0 },
      { ...promo, categoryId: null, title: 'For everyone', sortOrder: 1 },
      { ...promo, categoryId: frozen.id, title: 'Frozen promo', sortOrder: 2 },
    ]);
    const { data } = await nav();
    expect(data.departments.find((d) => d.slug === 'bakery')?.promo?.title).toBe('For everyone');
    expect(data.departments.find((d) => d.slug === 'frozen')?.promo?.title).toBe('Frozen promo');
  });

  it('lists departments in the shop order, not the order they were created', async () => {
    await createCategory({ slug: 'frozen', name: 'Frozen' });
    await createCategory({ slug: 'fruit-veg', name: 'Fruit & veg' });
    const { data } = await nav();
    expect(data.departments.map((d) => d.slug)).toEqual(['fruit-veg', 'frozen']);
  });

  it('leaves out archived products from the brand list', async () => {
    const bakery = await createCategory({ slug: 'bakery', name: 'Bakery' });
    const brand = await createBrand({ name: 'Ghostco' });
    await createProduct({ categoryId: bakery.id, brandId: brand.id, status: 'archived' });
    const { data } = await nav();
    expect(data.departments[0]?.brands).toEqual([]);
  });

  it('counts a subcategory product toward its department brands', async () => {
    const meat = await createCategory({ slug: 'meat-fish', name: 'Meat & fish' });
    const fish = await createCategory({ slug: 'fish-x', name: 'Fish', parentId: meat.id });
    const brand = await createBrand({ name: 'Coastco' });
    await createProduct({ categoryId: fish.id, brandId: brand.id });
    const { data } = await nav();
    expect(data.departments[0]?.brands).toEqual([
      { slug: expect.any(String) as string, name: 'Coastco' },
    ]);
  });
});

describe('/admin/menu-promos', () => {
  it('is for admins only', async () => {
    expect((await request(app).get('/api/v1/admin/menu-promos')).status).toBe(401);
    const customer = await createUser();
    const { token } = await createSession(customer.id);
    const res = await request(app).get('/api/v1/admin/menu-promos').set('Cookie', `sid=${token}`);
    expect(res.status).toBe(403);
  });

  it('creates (to the end of the list), lists in order, updates and deletes', async () => {
    const call = await asAdmin();
    const a = await call('post', '/admin/menu-promos', promo);
    expect(a.status).toBe(201);
    const b = await call('post', '/admin/menu-promos', { ...promo, title: 'Second' });
    const list = bodyOf<{
      data: { id: string; title: string; sortOrder: number; active: boolean }[];
    }>(await call('get', '/admin/menu-promos')).data;
    expect(list.map((p) => p.title)).toEqual(['Fresh this week', 'Second']);
    expect(list[1]?.sortOrder).toBeGreaterThan(list[0]?.sortOrder ?? 0);

    const id = bodyOf<{ data: { id: string } }>(b).data.id;
    const patched = await call('patch', `/admin/menu-promos/${id}`, {
      sortOrder: 0,
      active: false,
    });
    expect(patched.status).toBe(200);
    // A PATCH leaves untouched fields alone (no defaults refilled).
    expect(bodyOf<{ data: { subtitle: string; title: string } }>(patched).data).toMatchObject({
      title: 'Second',
      subtitle: 'Berries and herbs',
    });
    expect((await call('delete', `/admin/menu-promos/${id}`)).status).toBe(204);
    expect((await call('delete', `/admin/menu-promos/${id}`)).status).toBe(404);
  });

  it('rejects unsafe links and images', async () => {
    const call = await asAdmin();
    // A promo belongs to a department: an existing top-level category, never a subcategory.
    const sub = await createCategory({ slug: 'sub', parentId: (await createCategory()).id });
    const res404 = await call('post', '/admin/menu-promos', { ...promo, categoryId: sub.id });
    expect(res404.status).toBe(400);
    for (const bad of [
      { link: '//evil.example' },
      { link: 'javascript:alert(1)' },
      { link: 'http://insecure.example' },
      { imageUrl: 'data:image/png;base64,AAAA' },
      { imageAlt: ' ' },
      { categoryId: 'not-a-uuid' },
    ]) {
      const res = await call('post', '/admin/menu-promos', { ...promo, ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    }
  });
});
