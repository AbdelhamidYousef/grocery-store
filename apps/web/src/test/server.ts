import type { User } from '@store/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import {
  makeCard,
  makeCart,
  makeCategory,
  makeList,
  makeOrder,
  makeQuote,
  makeProduct,
  makeUser,
} from './fixtures';

export const API = 'http://api.test/api/v1';

// Default answers every test gets; a test overrides one with `server.use(...)`.
export const server = setupServer(
  // The "server unreachable" banner polls this from every page that has the layout.
  http.get(`${API}/health`, () => HttpResponse.json({ status: 'ok', db: 'ok', version: 'test' })),
  // Nobody is signed in unless a test says so (`server.use(signedInAs(...))`).
  http.get(`${API}/auth/me`, () =>
    HttpResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } },
      { status: 401 },
    ),
  ),
  // An empty cart unless a test says otherwise.
  http.get(`${API}/cart`, () => HttpResponse.json({ data: makeCart() })),
  // Standard shipping is free from 49 EUR, like the seeded method.
  http.get(`${API}/checkout/shipping-methods`, () =>
    HttpResponse.json({
      data: [
        makeQuote(),
        makeQuote({ code: 'express', name: 'Express', priceCents: 1190, freeOverCents: null }),
      ],
    }),
  ),
  // A freshly placed order waits for its webhook unless a test says otherwise.
  http.get(`${API}/checkout/orders/:number/status`, () =>
    HttpResponse.json({ data: { status: 'pending_payment', paymentStatus: 'processing' } }),
  ),
  http.get(`${API}/checkout/orders/:number`, () =>
    HttpResponse.json({
      data: makeOrder({ status: 'pending_payment', paymentStatus: 'processing' }),
    }),
  ),
  // No safety notices unless a test says so.
  http.get(`${API}/safety-notices/active`, () => HttpResponse.json({ data: [] })),
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

export function signedInAs(overrides: Partial<User> = {}) {
  return http.get(`${API}/auth/me`, () =>
    HttpResponse.json({ data: { user: makeUser(overrides) } }),
  );
}
