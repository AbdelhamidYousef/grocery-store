import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../test/server';

import { fetchProduct, fetchProducts, toListSearch } from './catalog';
import { ApiError } from './client';
import { fetchHealth } from './health';

const BASE = 'http://api.test/api/v1';

describe('apiFetch', () => {
  it('returns data parsed with the shared schema', async () => {
    server.use(
      http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'ok', db: 'ok', version: '1' })),
    );
    await expect(fetchHealth()).resolves.toEqual({ status: 'ok', db: 'ok', version: '1' });
  });

  it('sends cookies with every request', async () => {
    server.use(
      http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'ok', db: 'ok', version: '1' })),
    );
    const spy = vi.spyOn(globalThis, 'fetch');
    await fetchHealth();
    expect(spy).toHaveBeenCalledWith(
      `${BASE}/health`,
      expect.objectContaining({ credentials: 'include' }),
    );
    spy.mockRestore();
  });

  it('throws ApiError with code, status and details for an error response', async () => {
    server.use(
      http.get(`${BASE}/products/nope`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Product not found', details: { slug: 'nope' } } },
          { status: 404 },
        ),
      ),
    );
    const error = await fetchProduct('nope').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Product not found',
      details: { slug: 'nope' },
    });
  });

  it('rejects a response that does not match the schema', async () => {
    server.use(http.get(`${BASE}/products`, () => HttpResponse.json({ data: [{ id: 1 }] })));
    await expect(fetchProducts({})).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('turns a dropped connection into a NETWORK error', async () => {
    server.use(http.get(`${BASE}/health`, () => HttpResponse.error()));
    await expect(fetchHealth()).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
});

describe('toListSearch', () => {
  it('writes attribute filters as attr.<key>=a,b and skips defaults', () => {
    expect(
      toListSearch({
        category: 'dairy-eggs',
        page: 1,
        inStock: false,
        attr: { origin: ['spain', 'germany'], storage: [] },
        diet: ['vegan', 'gluten-free'],
        minPrice: 500,
      }),
    ).toBe(
      '?category=dairy-eggs&minPrice=500&diet=vegan%2Cgluten-free&attr.origin=spain%2Cgermany',
    );
  });

  it('is empty when there is nothing to send', () => {
    expect(toListSearch({})).toBe('');
  });
});

describe('store view header', () => {
  it('is sent from the URL prefix, and absent without one', async () => {
    const { storeViewHeader } = await import('./client');
    window.history.pushState({}, '', '/de-de/cart');
    expect(storeViewHeader()).toEqual({ 'X-Store-View': 'de-de' });
    window.history.pushState({}, '', '/admin/products');
    expect(storeViewHeader()).toEqual({});
    window.history.pushState({}, '', '/');
  });
});
