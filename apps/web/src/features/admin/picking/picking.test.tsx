import type { PickingResult, PickLine } from '@store/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAdminOrderDetail } from '../../../test/fixtures';
import { renderApp } from '../../../test/render';
import { API, server, signedInAs } from '../../../test/server';

const line = (over: Partial<PickLine> = {}): PickLine => ({
  itemId: 'item-1',
  orderNumber: 'GR-2026-000001',
  bag: 1,
  productName: 'Penne',
  variantName: '500 g',
  sku: 'PENNE',
  imageUrl: null,
  quantity: 2,
  pickedQty: null,
  pickStatus: 'pending',
  weighed: false,
  pricePerKgCents: null,
  packedGrams: null,
  replaces: null,
  swapStatus: null,
  substitution: 'best_match',
  zone: 'ambient',
  aisle: 3,
  batches: [{ bestBefore: '2027-01-05', quantity: 2 }],
  resolved: false,
  ...over,
});

function result(
  lines: PickLine[],
  over: Partial<PickingResult['orders'][number]> = {},
): PickingResult {
  return {
    store: { slug: 'mitte', name: 'Grocery Mitte' },
    generatedAt: '2026-11-21T10:00:00.000Z',
    totalOrders: 1,
    orders: [
      {
        number: 'GR-2026-000001',
        bag: 1,
        status: 'paid',
        deliveryKind: 'slot',
        deliveryFrom: '2026-11-21T13:00:00.000Z',
        deliveryTo: '2026-11-21T14:00:00.000Z',
        firstName: 'Ada',
        packedAt: null,
        lines,
        openLines: lines.filter((l) => !l.resolved).length,
        openSwaps: 0,
        ...over,
      },
    ],
    pickList: lines.map((l) => ({
      key: l.sku,
      zone: l.zone,
      aisle: l.aisle,
      productName: l.productName,
      variantName: l.variantName,
      sku: l.sku,
      imageUrl: null,
      weighed: l.weighed,
      totalQty: l.quantity,
      remainingQty: l.resolved ? 0 : l.quantity,
      stops: [
        {
          itemId: l.itemId,
          orderNumber: l.orderNumber,
          bag: l.bag,
          quantity: l.quantity,
          resolved: l.resolved,
          batches: l.batches,
        },
      ],
    })),
  };
}

beforeEach(() => {
  server.use(
    signedInAs({ role: 'admin' }),
    http.get(`${API}/admin/stores`, () =>
      HttpResponse.json({
        data: [
          { slug: 'mitte', name: 'Grocery Mitte' },
          { slug: 'neukoelln', name: 'Grocery Neukölln' },
        ],
      }),
    ),
  );
});

// A bag is a summary row until it is opened.
async function openBag() {
  const bag = await screen.findByTestId('picking-bag');
  await userEvent.click(within(bag).getByRole('button', { expanded: false }));
  return bag;
}

describe('the packer view', () => {
  it('shows the walk with aisle, zone, packs and the bag each unit goes to', async () => {
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({
          data: result([
            line(),
            line({ itemId: 'item-2', productName: 'Milk', sku: 'MILK', zone: 'chilled', aisle: 2 }),
          ]),
        }),
      ),
    );
    renderApp('/admin/picking');
    const entries = await screen.findAllByTestId('picking-entry');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Aisle 3');
    expect(entries[0]).toHaveTextContent('Penne');
    expect(entries[0]).toHaveTextContent('Bag 1 × 2');
    expect(entries[0]).toHaveTextContent('2 best before 2027-01-05');
    expect(screen.getByRole('heading', { name: 'Ambient' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chilled' })).toBeInTheDocument();
    expect(screen.getByText(/1 bag, 4 units left to pick/)).toBeInTheDocument();
    expect(screen.getByLabelText('Bag 1, order GR-2026-000001')).toHaveTextContent('14:00–15:00');
  });

  it('marks a line found and says what is sent', async () => {
    const sent: unknown[] = [];
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({ data: result([line()]) }),
      ),
      http.post(`${API}/admin/orders/:number/items/:itemId/pick`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          data: {
            orderNumber: 'GR-2026-000001',
            itemId: 'item-1',
            pickStatus: 'picked',
            packedGrams: null,
          },
        });
      }),
    );
    renderApp('/admin/picking');
    const bag = await openBag();
    await userEvent.click(within(bag).getByRole('button', { name: 'Found all 2' }));
    await waitFor(() => expect(sent).toEqual([{ action: 'found' }]));
  });

  it('asks for grams on a weighed line and sends them', async () => {
    const sent: unknown[] = [];
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({
          data: result([line({ weighed: true, pricePerKgCents: 200, productName: 'Bananas' })]),
        }),
      ),
      http.post(`${API}/admin/orders/:number/items/:itemId/pick`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          data: {
            orderNumber: 'GR-2026-000001',
            itemId: 'item-1',
            pickStatus: 'picked',
            packedGrams: 1180,
          },
        });
      }),
    );
    renderApp('/admin/picking');
    const bag = await openBag();
    expect(within(bag).queryByRole('button', { name: /Found all/ })).not.toBeInTheDocument();
    const weigh = within(bag).getByRole('button', { name: 'Weigh' });
    expect(weigh).toBeDisabled();
    await userEvent.type(within(bag).getByLabelText('Grams on the scale'), '1180{enter}');
    await waitFor(() => expect(sent).toEqual([{ action: 'weigh', grams: 1180 }]));
  });

  it('records a shortfall with a chosen replacement', async () => {
    const sent: unknown[] = [];
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({ data: result([line({ quantity: 3 })]) }),
      ),
      http.get(`${API}/admin/orders/:number/items/:itemId/substitutes`, () =>
        HttpResponse.json({
          data: [
            {
              variantId: 'v-2',
              productSlug: 'fusilli',
              productName: 'Fusilli',
              variantName: '500 g',
              imageUrl: null,
              imageAlt: null,
              unitPriceCents: 189,
            },
          ],
        }),
      ),
      http.post(`${API}/admin/orders/:number/items/:itemId/shortfall`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          data: {
            orderNumber: 'GR-2026-000001',
            originalItemId: 'item-1',
            substituteItemId: 'x',
            pickStatus: 'substituted',
          },
        });
      }),
    );
    renderApp('/admin/picking');
    const bag = await openBag();
    await userEvent.click(within(bag).getByRole('button', { name: 'Not all found' }));
    const dialog = await screen.findByRole('dialog', { name: /Penne: not all found/ });
    await userEvent.clear(within(dialog).getByLabelText('Units found'));
    await userEvent.type(within(dialog).getByLabelText('Units found'), '1');
    await userEvent.click(await within(dialog).findByLabelText(/Fusilli/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record shortfall' }));
    await waitFor(() => expect(sent).toEqual([{ pickedQty: 1, substituteVariantId: 'v-2' }]));
  });

  it('offers no replacement when the shopper asked for none, and locks a packed bag', async () => {
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({
          data: result([line({ substitution: 'none' })], { packedAt: '2026-11-21T10:30:00.000Z' }),
        }),
      ),
    );
    renderApp('/admin/picking');
    const bag = await openBag();
    expect(bag).toHaveTextContent('Packed.');
    expect(within(bag).queryByRole('button', { name: /Found all/ })).not.toBeInTheDocument();
  });

  it('says so when there is nothing to pack, and switches store', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/admin/stores/:slug/picking`, ({ params }) => {
        asked.push(String(params.slug));
        return HttpResponse.json({
          data: {
            ...result([]),
            store: { slug: String(params.slug), name: 'x' },
            orders: [],
            pickList: [],
          },
        });
      }),
    );
    renderApp('/admin/picking');
    expect(await screen.findByText(/Nothing to pack right now/)).toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText('Store'), 'neukoelln');
    await waitFor(() => expect(asked).toContain('neukoelln'));
  });
});

describe('a long queue', () => {
  it('says how many orders are not shown yet', async () => {
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({ data: { ...result([line()]), totalOrders: 57 } }),
      ),
    );
    renderApp('/admin/picking');
    expect(await screen.findByText(/Showing the first 1 of 57 orders/)).toBeInTheDocument();
  });
});

describe('closing and handing over a bag', () => {
  it('keeps "Bag packed" off until every line is done, then packs and hands over', async () => {
    const calls: string[] = [];
    let packedAt: string | null = null;
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({
          data: result([line({ pickStatus: 'picked', resolved: true })], { packedAt }),
        }),
      ),
      http.post(`${API}/admin/orders/:number/pack`, () => {
        calls.push('pack');
        packedAt = '2026-11-21T10:30:00.000Z';
        return HttpResponse.json({ data: makeAdminOrderDetail() });
      }),
      http.post(`${API}/admin/orders/:number/dispatch`, () => {
        calls.push('dispatch');
        return HttpResponse.json({ data: makeAdminOrderDetail() });
      }),
    );
    renderApp('/admin/picking');
    const bag = await openBag();
    await userEvent.click(within(bag).getByRole('button', { name: 'Bag packed' }));
    await waitFor(() => expect(calls).toEqual(['pack']));
    await userEvent.click(await within(bag).findByRole('button', { name: 'Hand to rider' }));
    await waitFor(() => expect(calls).toEqual(['pack', 'dispatch']));
  });

  it('disables "Bag packed" while a line is open', async () => {
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () =>
        HttpResponse.json({ data: result([line()]) }),
      ),
    );
    renderApp('/admin/picking');
    const bag = await openBag();
    expect(within(bag).getByRole('button', { name: 'Bag packed' })).toBeDisabled();
    expect(within(bag).getByText('Finish every line to close the bag.')).toBeInTheDocument();
  });
});

describe('find an order', () => {
  it('asks for one order by number and keeps it in the address', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ data: result([line()]) });
      }),
    );
    renderApp('/admin/picking?order=gr-2026-000001');
    await screen.findByTestId('picking-bag');
    expect(asked.some((s) => s.includes('order=GR-2026-000001'))).toBe(true);
    expect(screen.getByLabelText('Find an order')).toHaveValue('gr-2026-000001');
  });

  it('does not send half a number', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ data: result([line()]) });
      }),
    );
    renderApp('/admin/picking?order=GR-20');
    await screen.findByTestId('picking-bag');
    expect(asked.every((s) => !s.includes('order='))).toBe(true);
  });
});

describe('bags as summary rows', () => {
  const twoBags = (): PickingResult => {
    const a = result([line()]);
    const b = result([line({ itemId: 'item-2', orderNumber: 'GR-2026-000002', bag: 2 })], {
      number: 'GR-2026-000002',
      bag: 2,
      packedAt: '2026-11-21T10:30:00.000Z',
    });
    return { ...a, totalOrders: 2, orders: [...a.orders, ...b.orders] };
  };
  const serve = () =>
    server.use(
      http.get(`${API}/admin/stores/mitte/picking`, () => HttpResponse.json({ data: twoBags() })),
    );

  it('starts collapsed with order, window, items and status, and opens one at a time', async () => {
    serve();
    renderApp('/admin/picking');
    const bags = await screen.findAllByTestId('picking-bag');
    expect(bags).toHaveLength(2);
    expect(within(bags[0]!).getByText('To pick')).toBeInTheDocument();
    expect(within(bags[0]!).getByText('1 item')).toBeInTheDocument();
    expect(within(bags[1]!).getByText('Ready to hand over')).toBeInTheDocument();
    const [first, second] = bags.map((b) => within(b).getAllByRole('button')[0]!);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(within(bags[0]!).queryByRole('region')).not.toBeInTheDocument();

    await userEvent.click(first!);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(within(bags[0]!).getByRole('region')).toBeInTheDocument();
    await userEvent.click(second!);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(second!);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the bag named in the address', async () => {
    serve();
    renderApp('/admin/picking?order=GR-2026-000002');
    const bags = await screen.findAllByTestId('picking-bag');
    await waitFor(() => expect(within(bags[1]!).getByRole('region')).toBeInTheDocument());
    expect(within(bags[0]!).queryByRole('region')).not.toBeInTheDocument();
  });
});
