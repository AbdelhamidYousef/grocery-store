import type { User } from '@store/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import {
  makeCard,
  makeCart,
  makeCategory,
  makeGuideCard,
  makeHome,
  makeList,
  makeOrder,
  makeQuote,
  makePoints,
  makeProduct,
  makeReviewList,
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
  // The footer's charity line: a shelter with nothing given yet.
  http.get(`${API}/charity/total`, () =>
    HttpResponse.json({
      data: {
        charity: {
          slug: 'whisker-hollow-rescue',
          name: 'Whisker Hollow Rescue',
          description: 'Fictional.',
        },
        totalCents: 0,
        donations: 0,
      },
    }),
  ),
  http.get(`${API}/me/referral`, () =>
    HttpResponse.json({
      data: {
        code: 'PAWTEST1',
        rewardCents: 500,
        minOrderCents: 2000,
        codeDays: 90,
        maxPerYear: 10,
        pending: 0,
        qualified: 0,
        rejected: 0,
      },
    }),
  ),
  // A signed-in visitor has no points yet unless a test says so.
  http.get(`${API}/me/points`, () => HttpResponse.json({ data: makePoints() })),
  // A signed-in visitor has no pets unless a test says so.
  http.get(`${API}/account/pets`, () => HttpResponse.json({ data: [] })),
  // No menu data unless a test says so: the header then shows plain links to each pet's page.
  http.get(`${API}/navigation`, () => HttpResponse.json({ data: { pets: [] } })),
  // No sale banner unless a test says so.
  http.get(`${API}/promotions/banner`, () =>
    HttpResponse.json({ data: { sale: null, serverNow: new Date().toISOString() } }),
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
  // No reviews and no gallery photos unless a test says so.
  http.get(`${API}/products/:slug/reviews`, () => HttpResponse.json(makeReviewList())),
  http.get(`${API}/gallery`, () => HttpResponse.json({ data: [] })),
  // No safety notices unless a test says so.
  http.get(`${API}/safety-notices/active`, () => HttpResponse.json({ data: [] })),
  http.get(`${API}/home`, () => HttpResponse.json({ data: makeHome() })),
  http.get(`${API}/testimonials`, () =>
    HttpResponse.json({
      data: [
        { id: 't1', name: 'Mara K.', pet: 'Biscuit the beagle', rating: 5, quote: 'Tough rope.' },
      ],
      meta: { count: 6, average: 4.8 },
    }),
  ),
  http.get(`${API}/guides`, () =>
    HttpResponse.json({
      data: [makeGuideCard()],
      meta: { page: 1, limit: 3, total: 1, totalPages: 1 },
    }),
  ),
  // Admin product page content: empty unless a test says otherwise (the product screen asks).
  http.get(`${API}/admin/products/:id/content`, () =>
    HttpResponse.json({
      data: {
        specs: [],
        faqs: [],
        feedingTable: [],
        constituents: [],
        deliveryNote: null,
        sizeGuideId: null,
        relations: [],
      },
    }),
  ),
  http.get(`${API}/admin/size-guides`, () => HttpResponse.json({ data: [] })),
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
  // No recommendations and no recently viewed cards unless a test says so. `by-ids` comes before
  // `:slug`, like in the API router, or it would be read as a slug.
  http.get(`${API}/delivery-methods`, () =>
    HttpResponse.json({ data: { serverNow: new Date().toISOString(), methods: [] } }),
  ),
  http.get(`${API}/products/by-ids`, () => HttpResponse.json({ data: [] })),
  http.get(`${API}/products/:slug/recommendations`, () =>
    HttpResponse.json({ data: { boughtTogether: [], related: [] } }),
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
