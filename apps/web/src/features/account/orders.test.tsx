import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCustomerOrder, makeOrderSummary } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

function listOf(rows: ReturnType<typeof makeOrderSummary>[], page = 1, totalPages = 1) {
  return http.get(`${API}/account/orders`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      data: rows,
      meta: {
        page: Number(url.searchParams.get('page') ?? 1) || page,
        limit: 10,
        total: rows.length,
        totalPages,
      },
    });
  });
}

describe('order history list', () => {
  it('shows number, status, date, item count, thumbnails and total, linking to the detail', async () => {
    server.use(
      signedInAs(),
      listOf([
        makeOrderSummary(),
        makeOrderSummary({
          number: 'PW-2026-000122',
          status: 'shipped',
          itemCount: 1,
          thumbnails: [],
          totalCents: 1000,
        }),
      ]),
    );
    renderApp('/account/orders');
    const rows = await screen.findAllByTestId('order-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('href', '/account/orders/PW-2026-000123');
    expect(within(rows[0]!).getByTestId('order-status-badge')).toHaveTextContent('Paid');
    expect(rows[0]).toHaveTextContent('2 items');
    expect(rows[0]).toHaveTextContent('€26.89');
    expect(rows[0]!.querySelectorAll('img')).toHaveLength(1);
    expect(within(rows[1]!).getByTestId('order-status-badge')).toHaveTextContent('Shipped');
    expect(rows[1]).toHaveTextContent('1 item');
    expect(rows[1]!.querySelectorAll('img')).toHaveLength(0);
  });

  it('asks the API for the page in the URL and links the other pages', async () => {
    let asked = '';
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders`, ({ request }) => {
        asked = new URL(request.url).search;
        return HttpResponse.json({
          data: [makeOrderSummary({ number: 'PW-2026-000011' })],
          meta: { page: 2, limit: 10, total: 30, totalPages: 3 },
        });
      }),
    );
    renderApp('/account/orders?page=2');
    await screen.findByTestId('order-row');
    expect(asked).toBe('?page=2&limit=10');
    const pager = screen.getByTestId('pagination');
    expect(within(pager).getByRole('link', { name: 'Page 3' })).toHaveAttribute(
      'href',
      '/account/orders?page=3',
    );
    expect(within(pager).getByRole('link', { name: 'Page 1' })).toHaveAttribute(
      'href',
      '/account/orders',
    );
  });

  it('treats a broken page number as page 1', async () => {
    let asked = '';
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders`, ({ request }) => {
        asked = new URL(request.url).search;
        return HttpResponse.json({
          data: [],
          meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
        });
      }),
    );
    renderApp('/account/orders?page=abc');
    await screen.findByTestId('empty-state');
    expect(asked).toBe('?page=1&limit=10');
  });

  it('does not claim there are no orders when the page is past the end', async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders`, () =>
        HttpResponse.json({ data: [], meta: { page: 9, limit: 10, total: 30, totalPages: 3 } }),
      ),
    );
    renderApp('/account/orders?page=9');
    const note = await screen.findByTestId('empty-state');
    expect(note).toHaveTextContent('There are no orders on this page.');
    expect(note).not.toHaveTextContent('You have not placed an order yet.');
    expect(within(note).getByRole('link')).toHaveAttribute('href', '/account/orders?page=3');
  });

  it('offers a retry when the list cannot be loaded', async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
      ),
    );
    renderApp('/account/orders');
    expect(
      await screen.findByText('We could not load your orders.', {}, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

describe('order detail', () => {
  it('shows the timeline, items, totals, address and method', async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders/:number`, () =>
        HttpResponse.json({ data: makeCustomerOrder() }),
      ),
    );
    renderApp('/account/orders/PW-2026-000123');
    const page = await screen.findByTestId('page-order-detail');
    await waitFor(() => expect(page).toHaveAttribute('data-state', 'ready'));
    expect(within(page).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Order PW-2026-000123',
    );
    expect(within(page).getByTestId('order-status-badge')).toHaveTextContent('Paid');
    const steps = within(page).getAllByTestId('order-timeline-step');
    expect(steps.map((s) => s.getAttribute('data-status'))).toEqual(['pending_payment', 'paid']);
    expect(steps[1]).toHaveTextContent('Payment confirmed');
    expect(within(page).getByTestId('order-summary')).toHaveTextContent('Rope Tug');
    expect(within(page).getByTestId('order-total')).toHaveTextContent('€26.89');
    expect(within(page).getByTestId('order-address')).toHaveTextContent('1 Bone Street');
    expect(within(page).getByRole('link', { name: 'Back to orders' })).toHaveAttribute(
      'href',
      '/account/orders',
    );
  });

  it("shows a friendly not-found state for someone else's order", async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders/:number`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Order not found' } },
          { status: 404 },
        ),
      ),
    );
    renderApp('/account/orders/PW-2026-000999');
    const page = await screen.findByTestId('page-order-detail');
    await waitFor(() => expect(page).toHaveAttribute('data-state', 'not-found'));
    expect(page).toHaveTextContent("We can't find that order");
  });
});
