import type { CategoryNode } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';

const app = makeTestApp();
const get = (path: string) => request(app).get(path);

async function seedTree() {
  const dogs = await createCategory({
    slug: 'dogs',
    name: 'Dogs',
    sortOrder: 1,
    attributes: { accentColor: '#F59E0B', icon: 'dog' },
  });
  const cats = await createCategory({ slug: 'cats', name: 'Cats', sortOrder: 2 });
  const toys = await createCategory({
    slug: 'dog-toys',
    name: 'Toys',
    parentId: dogs.id,
    sortOrder: 1,
  });
  const beds = await createCategory({
    slug: 'dog-beds',
    name: 'Beds',
    parentId: dogs.id,
    sortOrder: 2,
  });
  return { dogs, cats, toys, beds };
}

describe('GET /api/v1/categories', () => {
  it('returns an empty list when there are no categories', async () => {
    const res = await get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toEqual({ data: [] });
  });

  it('returns the tree ordered by sortOrder with theme data on top-level categories', async () => {
    await seedTree();
    const res = await get('/api/v1/categories');
    const { data } = bodyOf<{ data: CategoryNode[] }>(res);
    expect(data.map((c) => c.slug)).toEqual(['dogs', 'cats']);
    expect(data[0]).toMatchObject({ accentColor: '#F59E0B', icon: 'dog' });
    expect(data[1]).toMatchObject({ accentColor: null, icon: null });
    expect(data[0]?.children.map((c) => c.slug)).toEqual(['dog-toys', 'dog-beds']);
    expect(data[1]?.children).toEqual([]);
  });

  it('counts only active products and rolls children up into the parent', async () => {
    const { toys, beds, dogs } = await seedTree();
    await createProduct({ categoryId: toys.id });
    await createProduct({ categoryId: toys.id });
    await createProduct({ categoryId: toys.id, status: 'draft' });
    await createProduct({ categoryId: beds.id, status: 'archived' });
    await createProduct({ categoryId: dogs.id });

    const { data } = bodyOf<{ data: CategoryNode[] }>(await get('/api/v1/categories'));
    const dogsNode = data.find((c) => c.slug === 'dogs');
    expect(dogsNode?.productCount).toBe(3);
    expect(dogsNode?.children.find((c) => c.slug === 'dog-toys')?.productCount).toBe(2);
    expect(dogsNode?.children.find((c) => c.slug === 'dog-beds')?.productCount).toBe(0);
  });
});

describe('GET /api/v1/categories/:slug', () => {
  it('returns the category with its children', async () => {
    await seedTree();
    const res = await get('/api/v1/categories/dogs');
    const { data } = bodyOf<{ data: CategoryNode }>(res);
    expect(res.status).toBe(200);
    expect(data.slug).toBe('dogs');
    expect(data.children.map((c) => c.slug)).toEqual(['dog-toys', 'dog-beds']);
  });

  it('returns a child category with no children of its own', async () => {
    await seedTree();
    const { data } = bodyOf<{ data: CategoryNode }>(await get('/api/v1/categories/dog-toys'));
    expect(data).toMatchObject({
      slug: 'dog-toys',
      parentId: expect.any(String) as string,
      children: [],
    });
  });

  it('answers 404 NOT_FOUND for an unknown slug', async () => {
    const res = await get('/api/v1/categories/nope');
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});
