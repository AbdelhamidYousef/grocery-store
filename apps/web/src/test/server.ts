import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { makeCard, makeCategory, makeList, makeProduct } from './fixtures';

export const API = 'http://api.test/api/v1';

// Default answers every test gets; a test overrides one with `server.use(...)`.
export const server = setupServer(
  http.get(`${API}/categories`, () =>
    HttpResponse.json({
      data: [
        makeCategory({ slug: 'dogs', name: 'Dogs' }),
        makeCategory({ id: 'c2', slug: 'cats', name: 'Cats', productCount: 4 }),
      ],
    }),
  ),
  http.get(`${API}/categories/:slug`, ({ params }) =>
    params.slug === 'dogs' || params.slug === 'cats'
      ? HttpResponse.json({
          data: makeCategory({ slug: params.slug, name: params.slug === 'dogs' ? 'Dogs' : 'Cats' }),
        })
      : HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Category not found' } },
          { status: 404 },
        ),
  ),
  http.get(`${API}/products`, () =>
    HttpResponse.json(makeList([makeCard(), makeCard({ id: 'p2', slug: 'ball', name: 'Ball' })])),
  ),
  http.get(`${API}/products/:slug`, ({ params }) =>
    params.slug === 'rope-tug'
      ? HttpResponse.json({ data: makeProduct() })
      : HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Product not found' } },
          { status: 404 },
        ),
  ),
);
