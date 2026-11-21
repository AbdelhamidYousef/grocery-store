import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAdminOrderDetail, makeAdminOrderRow } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

const meta = (total: number, page = 1, totalPages = 1) => ({ page, limit: 20, total, totalPages });
const NUMBER = 'PW-2026-000101';

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
});

function apiError(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

describe('admin order list', () => {
  it('shows orders with status, customer, total and a link to the detail', async () => {
    server.use(
      http.get(`${API}/admin/orders`, () =>
        HttpResponse.json({
          data: [
            makeAdminOrderRow(),
            makeAdminOrderRow({ number: 'PW-2026-000102', status: 'shipped' }),
          ],
          meta: meta(2),
        }),
      ),
    );
    renderApp('/admin/orders');
    const rows = await screen.findAllByTestId('admin-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Paid');
    expect(rows[0]).toHaveTextContent('42.97');
    expect(rows[1]).toHaveTextContent('Shipped');
    expect(screen.getByRole('link', { name: NUMBER })).toHaveAttribute(
      'href',
      `/admin/orders/${NUMBER}`,
    );
  });

  it('breaks a long email inside its cell and scrolls the table inside its box', async () => {
    const email = `${'very-long-address-'.repeat(6)}@example.com`;
    server.use(
      http.get(`${API}/admin/orders`, () =>
        HttpResponse.json({ data: [makeAdminOrderRow({ email })], meta: meta(1) }),
      ),
    );
    renderApp('/admin/orders');
    const cell = await screen.findByText(email);
    expect(cell.className).toContain('break-all');
    expect(screen.getByTestId('admin-table').className).toContain('overflow-x-auto');
  });

  it('sends the status, search and page from the URL, and offers every status', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/admin/orders`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ data: [makeAdminOrderRow()], meta: meta(60, 2, 3) });
      }),
    );
    renderApp('/admin/orders?status=shipped&q=sam&page=2');
    await screen.findAllByTestId('admin-row');
    const params = new URLSearchParams(seen[0]);
    expect(params.get('status')).toBe('shipped');
    expect(params.get('q')).toBe('sam');
    expect(params.get('page')).toBe('2');
    expect(screen.getByLabelText('Status')).toHaveValue('shipped');
    expect(within(screen.getByLabelText('Status')).getAllByRole('option')).toHaveLength(8);
  });

  it('writes a filter into the URL', async () => {
    server.use(
      http.get(`${API}/admin/orders`, () =>
        HttpResponse.json({ data: [makeAdminOrderRow()], meta: meta(1) }),
      ),
    );
    const router = renderApp('/admin/orders');
    await screen.findAllByTestId('admin-row');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'cancelled');
    await waitFor(() => expect(router.state.location.search).toBe('?status=cancelled'));
  });

  it('shows an empty state, with a way out when filtered', async () => {
    server.use(
      http.get(`${API}/admin/orders`, () => HttpResponse.json({ data: [], meta: meta(0, 1, 0) })),
    );
    renderApp('/admin/orders?status=refunded');
    const empty = await screen.findByTestId('admin-empty');
    expect(empty).toHaveTextContent('No orders match this search.');
    expect(
      within(empty).getByRole('link', { name: 'Clear search and filters' }),
    ).toBeInTheDocument();
  });
});

describe('admin order detail', () => {
  // The "database": a transition handler may replace it, and the next GET returns the new state,
  // like the real API (the page re-reads the order after a move).
  let current = makeAdminOrderDetail();
  function serveOrder(detail = makeAdminOrderDetail()) {
    current = detail;
    server.use(
      http.get(`${API}/admin/orders/${NUMBER}`, () => HttpResponse.json({ data: current })),
    );
  }

  it('shows items, totals, addresses, the Stripe link and the history timeline', async () => {
    serveOrder();
    renderApp(`/admin/orders/${NUMBER}`);
    expect(await screen.findByRole('heading', { name: NUMBER })).toBeInTheDocument();
    expect(screen.getByTestId('admin-order-status')).toHaveTextContent('Paid');
    expect(screen.getByText('Squeaky Duck')).toBeInTheDocument();
    expect(screen.getAllByText(/1 Bone Street/)[0]).toHaveTextContent('Sam Rivers');
    expect(screen.getByText('Same as shipping')).toBeInTheDocument();
    expect(screen.getByTestId('admin-stripe-link')).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/test/payments/pi_3Test123',
    );
    const steps = within(screen.getByTestId('admin-timeline')).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveTextContent('Pending payment to Paid');
    expect(steps[1]).toHaveTextContent('by stripe');
  });

  it('lists the promotions snapshot, and nothing when there are none', async () => {
    serveOrder(
      makeAdminOrderDetail({
        promotions: [
          { type: 'code', label: 'GROCERY10', cents: 380 },
          { type: 'gift', label: 'Free gift: Peanut Crunch Biscuits', cents: 0 },
        ],
      }),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    const list = await screen.findByTestId('admin-order-promotions');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveTextContent('GROCERY10: -€3.80');
    expect(list).toHaveTextContent('Free gift: Peanut Crunch Biscuits: no charge');
  });

  it('shows no promotions block for an order without any', async () => {
    serveOrder();
    renderApp(`/admin/orders/${NUMBER}`);
    await screen.findByRole('heading', { name: NUMBER });
    expect(screen.queryByTestId('admin-order-promotions')).not.toBeInTheDocument();
  });

  it('offers exactly the allowed moves as buttons, never "paid"', async () => {
    serveOrder(makeAdminOrderDetail({ allowedNext: ['processing', 'paid', 'cancelled'] }));
    renderApp(`/admin/orders/${NUMBER}`);
    const panel = within(await screen.findByTestId('admin-transition'));
    expect(panel.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Start processing',
      'Cancel order',
    ]);
  });

  it('says there is nothing to do for a finished order', async () => {
    serveOrder(makeAdminOrderDetail({ allowedNext: [] }, 'delivered'));
    renderApp(`/admin/orders/${NUMBER}`);
    expect(
      await screen.findByText(/No further actions: this order is delivered/),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('admin-transition')).queryByRole('button')).toBeNull();
  });

  it('moves the order at once with a note, and the buttons change to the new allowed moves', async () => {
    let body: unknown;
    serveOrder();
    server.use(
      http.post(`${API}/admin/orders/${NUMBER}/transition`, async ({ request }) => {
        body = await request.json();
        current = makeAdminOrderDetail({ allowedNext: ['shipped', 'cancelled'] }, 'processing');
        return HttpResponse.json({ data: current });
      }),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    await userEvent.type(await screen.findByLabelText('Note (optional)'), 'Packed in box 4');
    await userEvent.click(screen.getByRole('button', { name: 'Start processing' }));
    await waitFor(() => expect(body).toEqual({ to: 'processing', note: 'Packed in box 4' }));
    expect(await screen.findByRole('button', { name: 'Mark shipped' })).toBeInTheDocument();
    expect(screen.getByTestId('admin-order-status')).toHaveTextContent('Processing');
    expect(screen.queryByRole('button', { name: 'Start processing' })).not.toBeInTheDocument();
  });

  it('points an authorised order to the packer view instead of offering "Mark shipped"', async () => {
    const base = makeAdminOrderDetail({ allowedNext: ['cancelled'] }, 'processing');
    serveOrder(
      makeAdminOrderDetail(
        { allowedNext: ['cancelled'], order: { ...base.order, authorizedCents: 5000 } },
        'processing',
      ),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    const hint = await screen.findByTestId('admin-via-packer');
    expect(within(hint).getByRole('link', { name: 'packer view' })).toHaveAttribute(
      'href',
      `/admin/picking?order=${NUMBER}`,
    );
    expect(screen.queryByRole('button', { name: 'Mark shipped' })).not.toBeInTheDocument();
  });

  it('shows no packer hint for an order that was charged in full at checkout', async () => {
    serveOrder(makeAdminOrderDetail({ allowedNext: ['shipped', 'cancelled'] }, 'processing'));
    renderApp(`/admin/orders/${NUMBER}`);
    expect(await screen.findByRole('button', { name: 'Mark shipped' })).toBeInTheDocument();
    expect(screen.queryByTestId('admin-via-packer')).not.toBeInTheDocument();
  });

  it('asks for confirmation before a cancel and sends nothing until it is given', async () => {
    let calls = 0;
    serveOrder();
    server.use(
      http.post(`${API}/admin/orders/${NUMBER}/transition`, () => {
        calls += 1;
        current = makeAdminOrderDetail({ allowedNext: [] }, 'cancelled');
        return HttpResponse.json({ data: current });
      }),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/refunded in Stripe/)).toBeInTheDocument();
    expect(calls).toBe(0);
    await userEvent.click(dialog.getByRole('button', { name: 'Keep the order as it is' }));
    expect(calls).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, cancel order' }));
    await waitFor(() => expect(calls).toBe(1));
    expect(
      await screen.findByText(/No further actions: this order is cancelled/),
    ).toBeInTheDocument();
  });

  it('warns that shipped goods are not restocked when refunding', async () => {
    serveOrder(makeAdminOrderDetail({ allowedNext: ['refunded'] }, 'shipped'));
    renderApp(`/admin/orders/${NUMBER}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Refund order' }));
    expect(await screen.findByText(/add them back from the product page/)).toBeInTheDocument();
  });

  it('shows the server sentence and re-reads the order when the move is refused', async () => {
    let reads = 0;
    server.use(
      http.get(`${API}/admin/orders/${NUMBER}`, () => {
        reads += 1;
        return HttpResponse.json({
          data: makeAdminOrderDetail(reads > 1 ? { allowedNext: ['shipped'] } : {}, 'processing'),
        });
      }),
      http.post(`${API}/admin/orders/${NUMBER}/transition`, () =>
        apiError(409, 'CONFLICT', 'Cannot move from processing to processing'),
      ),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Start processing' }));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Cannot move');
    // The refetch gave the real buttons.
    expect(await screen.findByRole('button', { name: 'Mark shipped' })).toBeInTheDocument();
  });

  it('says so when the order does not exist', async () => {
    server.use(
      http.get(`${API}/admin/orders/${NUMBER}`, () =>
        apiError(404, 'NOT_FOUND', 'Order not found'),
      ),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    expect(await screen.findByText('That order does not exist.')).toBeInTheDocument();
  });

  it('copes with a guest order that has no payment and a very long product name', async () => {
    const detail = makeAdminOrderDetail({ payment: null, customer: null });
    detail.order.items[0]!.productName = 'Long '.repeat(40).trim();
    serveOrder(detail);
    renderApp(`/admin/orders/${NUMBER}`);
    expect(await screen.findByText('Guest checkout')).toBeInTheDocument();
    expect(screen.getByText('No payment started')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-stripe-link')).not.toBeInTheDocument();
    expect(screen.getByText(detail.order.items[0]!.productName).className).toContain('break-words');
  });
});

describe('admin order detail: capture now', () => {
  const weighedItem = {
    id: 'oi-w',
    productName: 'Bananas',
    variantName: 'Standard',
    sku: 'GR-BAN',
    imageUrl: null,
    unitPriceCents: 189,
    quantity: 2,
    lineTotalCents: 378,
    pricePerKgCents: 378,
    weighedGrams: null,
    finalCents: null,
    shortDated: false,
    depositCents: 0,
    pickStatus: 'pending' as const,
    pickedQty: null,
    substitutesItemId: null,
    swapStatus: null,
    listPriceCents: null,
    refundedCents: 0,
  };
  function authorised(over: { capturedCents?: number | null } = {}) {
    const base = makeAdminOrderDetail();
    return makeAdminOrderDetail({
      order: {
        ...base.order,
        authorizedCents: 4354,
        capturedCents: over.capturedCents ?? null,
        items: [...base.order.items, weighedItem],
      },
      payment: { ...base.payment!, status: over.capturedCents ? 'succeeded' : 'authorized' },
    });
  }
  // The "database": a capture replaces it, and the next GET returns the new state.
  let current = authorised();
  const serve = (detail: ReturnType<typeof authorised>) => {
    current = detail;
    server.use(
      http.get(`${API}/admin/orders/${NUMBER}`, () => HttpResponse.json({ data: current })),
    );
  };

  it('offers it for an authorised order and sends the typed grams, never an amount', async () => {
    let body: unknown;
    serve(authorised());
    server.use(
      http.post(`${API}/admin/orders/${NUMBER}/capture`, async ({ request }) => {
        body = await request.json();
        current = authorised({ capturedCents: 4297 });
        return HttpResponse.json({ data: current });
      }),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    const panel = within(await screen.findByTestId('admin-capture'));
    expect(panel.getByText(/€43\.54 is held on the card/)).toBeInTheDocument();
    await userEvent.type(panel.getByLabelText('Bananas: grams packed'), '940');
    await userEvent.click(panel.getByRole('button', { name: 'Capture now' }));
    await waitFor(() => expect(body).toEqual({ weights: [{ orderItemId: 'oi-w', grams: 940 }] }));
    expect(await screen.findByTestId('admin-captured')).toHaveTextContent(
      'Captured €42.97 of €43.54 authorised',
    );
    expect(screen.queryByTestId('admin-capture')).not.toBeInTheDocument();
  });

  it('captures at the estimate when no weight is typed', async () => {
    let body: unknown;
    serve(authorised());
    server.use(
      http.post(`${API}/admin/orders/${NUMBER}/capture`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: authorised({ capturedCents: 4297 }) });
      }),
    );
    renderApp(`/admin/orders/${NUMBER}`);
    await userEvent.click(
      await within(await screen.findByTestId('admin-capture')).findByRole('button', {
        name: 'Capture now',
      }),
    );
    await waitFor(() => expect(body).toEqual({}));
  });

  it('is not offered for an order charged in full or already captured', async () => {
    serve(makeAdminOrderDetail());
    renderApp(`/admin/orders/${NUMBER}`);
    await screen.findByRole('heading', { name: NUMBER });
    expect(screen.queryByTestId('admin-capture')).not.toBeInTheDocument();
  });

  it('warns that cancelling releases the hold instead of refunding it', async () => {
    serve(authorised());
    renderApp(`/admin/orders/${NUMBER}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    expect(
      await screen.findByText(/The hold on the customer card is released/),
    ).toBeInTheDocument();
  });
});
