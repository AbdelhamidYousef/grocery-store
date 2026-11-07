import { PET_CATEGORY_SLUGS, type Navigation } from '@store/shared';
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
  pet: 'dog',
  title: 'Walkies',
  subtitle: 'Leads and more',
  imageUrl: '/products/dog-toys/x.webp',
  imageAlt: 'A lead',
  link: '/c/dog-walk',
};

describe('GET /navigation', () => {
  it('builds a panel per pet from the category tree, brands and promos, publicly cacheable', async () => {
    const dogs = await createCategory({ slug: PET_CATEGORY_SLUGS.dog, name: 'Dogs' });
    const toys = await createCategory({ slug: 'dog-toys-x', name: 'Toys', parentId: dogs.id });
    const brand = await createBrand({ name: 'Wuffco' });
    await createProduct({ categoryId: toys.id, brandId: brand.id, attributes: { pet: 'dog' } });
    await db.insert(menuPromos).values({ ...promo, pet: 'dog', sortOrder: 0 } as never);

    const { res, data } = await nav();
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
    expect(res.headers['set-cookie']).toBeUndefined();
    const dog = data.pets.find((p) => p.pet === 'dog');
    expect(dog).toMatchObject({
      name: 'Dogs',
      categorySlug: 'dogs',
      categories: [{ slug: 'dog-toys-x', name: 'Toys', productCount: 1 }],
      brands: [{ name: 'Wuffco' }],
      promo: { title: 'Walkies', link: '/c/dog-walk' },
    });
    // A pet with no top-level category has no panel.
    expect(data.pets.find((p) => p.pet === 'cat')).toBeUndefined();
  });

  it('shows a pet its own promo, else the first "any pet" one, and never an inactive promo', async () => {
    await createCategory({ slug: PET_CATEGORY_SLUGS.cat, name: 'Cats' });
    await createCategory({ slug: PET_CATEGORY_SLUGS.bird, name: 'Birds' });
    await db.insert(menuPromos).values([
      { ...promo, pet: 'cat', title: 'Hidden cat', active: false, sortOrder: 0 },
      { ...promo, pet: null, title: 'For everyone', sortOrder: 1 },
      { ...promo, pet: 'bird', title: 'Bird promo', sortOrder: 2 },
    ] as never);
    const { data } = await nav();
    expect(data.pets.find((p) => p.pet === 'cat')?.promo?.title).toBe('For everyone');
    expect(data.pets.find((p) => p.pet === 'bird')?.promo?.title).toBe('Bird promo');
  });

  it('leaves out archived products from the brand list', async () => {
    const dogs = await createCategory({ slug: PET_CATEGORY_SLUGS.dog, name: 'Dogs' });
    const brand = await createBrand({ name: 'Ghostco' });
    await createProduct({
      categoryId: dogs.id,
      brandId: brand.id,
      status: 'archived',
      attributes: { pet: 'dog' },
    });
    const { data } = await nav();
    expect(data.pets[0]?.brands).toEqual([]);
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
    const b = await call('post', '/admin/menu-promos', { ...promo, title: 'Second', pet: null });
    const list = bodyOf<{
      data: { id: string; title: string; sortOrder: number; active: boolean }[];
    }>(await call('get', '/admin/menu-promos')).data;
    expect(list.map((p) => p.title)).toEqual(['Walkies', 'Second']);
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
      subtitle: 'Leads and more',
    });
    expect((await call('delete', `/admin/menu-promos/${id}`)).status).toBe(204);
    expect((await call('delete', `/admin/menu-promos/${id}`)).status).toBe(404);
  });

  it('rejects unsafe links and images', async () => {
    const call = await asAdmin();
    for (const bad of [
      { link: '//evil.example' },
      { link: 'javascript:alert(1)' },
      { link: 'http://insecure.example' },
      { imageUrl: 'data:image/png;base64,AAAA' },
      { imageAlt: ' ' },
      { pet: 'horse' },
    ]) {
      const res = await call('post', '/admin/menu-promos', { ...promo, ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    }
  });
});
