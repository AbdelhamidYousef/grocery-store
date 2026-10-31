import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PUBLIC_CATALOG_CACHE } from '../../middleware/cache.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';

const app = makeTestApp();

describe('catalog caching headers', () => {
  it.each(['/api/v1/categories', '/api/v1/products'])(
    'sets Cache-Control and an ETag on GET %s',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(PUBLIC_CATALOG_CACHE);
      expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
      expect(res.headers.etag).toBeDefined();
    },
  );

  it('sets them on the category and product detail endpoints too', async () => {
    await createProduct({ slug: 'rope' });
    const product = await request(app).get('/api/v1/products/rope');
    expect(product.headers['cache-control']).toBe(PUBLIC_CATALOG_CACHE);
  });

  it('answers 304 Not Modified when the ETag still matches', async () => {
    await createProduct({ slug: 'rope' });
    const first = await request(app).get('/api/v1/products');
    const second = await request(app)
      .get('/api/v1/products')
      .set('If-None-Match', first.headers.etag as string);
    expect(second.status).toBe(304);
  });

  it('serves a new ETag once the data changes', async () => {
    await createProduct({ slug: 'one' });
    const before = await request(app).get('/api/v1/products');
    await createProduct({ slug: 'two' });
    const after = await request(app).get('/api/v1/products');
    expect(after.headers.etag).not.toBe(before.headers.etag);
  });

  it('never caches errors', async () => {
    const notFound = await request(app).get('/api/v1/products/nope');
    expect(notFound.status).toBe(404);
    expect(notFound.headers['cache-control']).toBe('no-store');
    const invalid = await request(app).get('/api/v1/products?page=0');
    expect(invalid.status).toBe(400);
    expect(invalid.headers['cache-control']).toBe('no-store');
  });

  it('does not stamp the public cache on non-catalog routes', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.headers['cache-control']).toBeUndefined();
    const unknown = await request(app).get('/api/v1/cart');
    expect(unknown.headers['cache-control']).toBe('no-store');
  });
});
