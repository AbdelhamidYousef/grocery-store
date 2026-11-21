import type { User } from '@store/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import type { WebCart, WebCartItem } from '../api/cart';

import {
  makeCard,
  makeDeliveryAreas,
  makeHeldDelivery,
  makeSlotsData,
  makePostcodeLookup,
  makeBill,
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
  // The hearts on product cards read the wishlist: an empty list unless a test says otherwise.
  // Delivery areas (G4): three postcodes are served, any other well-formed one is not.
  http.get(`${API}/delivery/postcodes/:code`, ({ params }) => {
    const code = String(params.code);
    if (!/^\d{5}$/.test(code)) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'A postcode has five digits' } },
        { status: 400 },
      );
    }
    return HttpResponse.json({ data: makePostcodeLookup(code) });
  }),
  http.get(`${API}/delivery/areas`, () => HttpResponse.json({ data: makeDeliveryAreas() })),
  // Delivery slots (G5): two open today, one full, one closed, express off unless a test says so.
  http.get(`${API}/delivery/slots`, () => HttpResponse.json({ data: makeSlotsData() })),
  http.get(`${API}/wishlist`, () => HttpResponse.json({ data: { items: [], shareToken: null } })),
  // The footer's charity line: a shelter with nothing given yet.
  http.get(`${API}/charity/total`, () =>
    HttpResponse.json({
      data: {
        charity: {
          slug: 'spreeufer-food-bank',
          name: 'Spreeufer Food Bank',
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
  // No reviews unless a test says so.
  http.get(`${API}/products/:slug/reviews`, () => HttpResponse.json(makeReviewList())),
  // A delivered order's page asks for its returns: nothing returned and nothing eligible by default.
  http.get(`${API}/orders/:number/returns`, () =>
    HttpResponse.json({
      data: {
        returns: [],
        eligibility: {
          eligible: false,
          reason: 'Only a delivered order can be returned',
          deadline: null,
          lines: [],
        },
      },
    }),
  ),
  // No safety notices unless a test says so.
  http.get(`${API}/safety-notices/active`, () => HttpResponse.json({ data: [] })),
  http.get(`${API}/home`, () => HttpResponse.json({ data: makeHome() })),
  http.get(`${API}/testimonials`, () =>
    HttpResponse.json({
      data: [
        { id: 't1', name: 'Mara K.', area: 'Prenzlauer Berg', rating: 5, quote: 'Fresh and fast.' },
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
        constituents: [],
        deliveryNote: null,
        relations: [],
      },
    }),
  ),
  http.get(`${API}/categories`, () =>
    HttpResponse.json({
      data: [
        makeCategory({ slug: 'dairy-eggs', name: 'Dairy & eggs' }),
        makeCategory({
          id: 'c2',
          slug: 'bakery',
          name: 'Bakery',
          productCount: 4,
          departmentSlug: 'bakery',
        }),
      ],
    }),
  ),
  http.get(`${API}/categories/:slug`, ({ params }) =>
    params.slug === 'dairy-eggs' || params.slug === 'bakery'
      ? HttpResponse.json({
          data: makeCategory({
            slug: params.slug,
            departmentSlug: params.slug,
            name: params.slug === 'dairy-eggs' ? 'Dairy & eggs' : 'Bakery',
          }),
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
  http.get(`${API}/products/by-ids`, () => HttpResponse.json({ data: [] })),
  // The short-dated shelf (G6): no deals unless a test says so.
  http.get(`${API}/products/short-dated`, () => HttpResponse.json({ data: [] })),
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

/**
 * Serves `GET /cart` for the given items and the delivery-time writes of a real cart: `PUT
 * /cart/slot` and `PUT /cart/express` hold a choice that the next `GET /cart` returns, `DELETE
 * /cart/slot` lets go of it. Start state: nothing chosen, or `delivery` when given.
 */
export function serveCartWithDelivery(
  items: WebCartItem[],
  delivery: WebCart['delivery'] = null,
): void {
  let held = delivery;
  // The server's bill follows the held delivery: a slot is 2.99, express 4.99, none chosen is the
  // cheapest slot as an estimate (the numbers of `basketTotals`, which the browser never adds up).
  const answer = () => {
    const cart = makeCart(items);
    const fee = held === null ? 299 : held.kind === 'express' ? 499 : 299;
    return HttpResponse.json({
      data: {
        ...cart,
        delivery: held,
        pricing: {
          ...cart.pricing,
          shippingEstimateCents: fee,
          bill: makeBill({
            deliveryKind: held?.kind ?? null,
            deliveryFeeCents: fee,
            deliveryFeeBeforeFreeCents: fee,
            deliveryEstimated: held === null,
          }),
        },
      },
    });
  };
  server.use(
    http.get(`${API}/cart`, answer),
    http.put(`${API}/cart/slot`, async ({ request }) => {
      const { slotId } = (await request.json()) as { slotId: string };
      held = makeHeldDelivery(slotId);
      return answer();
    }),
    http.put(`${API}/cart/express`, () => {
      held = { kind: 'express', slot: null, holdExpiresAt: null };
      return answer();
    }),
    http.delete(`${API}/cart/slot`, () => {
      held = null;
      return answer();
    }),
  );
}
