import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCart, makeCustomerOrder } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

const item = (over: object = {}) => ({
  variantId: 'v-1',
  productId: 'p-1',
  slug: 'squeaky-bone',
  name: 'Squeaky bone',
  variantName: 'Large',
  image: null,
  priceCents: 1299,
  currency: 'EUR',
  available: true,
  lastBoughtAt: '2026-11-01T10:00:00.000Z',
  timesBought: 1,
  ...over,
});

describe('buy again', () => {
  it("lists past items at today's price, sold-out ones disabled", async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/me/buy-again`, () =>
        HttpResponse.json({
          data: [
            item(),
            item({ variantId: 'v-2', name: 'Cat tower', available: false, timesBought: 3 }),
          ],
        }),
      ),
    );
    renderApp('/account/buy-again');
    const rows = await screen.findAllByTestId('buy-again-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('button', { name: 'Add to cart' })).toBeEnabled();
    expect(within(rows[1]!).getByRole('button', { name: 'Sold out' })).toBeDisabled();
    expect(rows[1]).toHaveTextContent('bought 3 times');
  });

  it('says so when there is nothing to buy again', async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/me/buy-again`, () => HttpResponse.json({ data: [] })),
    );
    renderApp('/account/buy-again');
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it('is in the account menu for a signed-in shopper', async () => {
    server.use(
      signedInAs(),
      http.get(`${API}/me/buy-again`, () => HttpResponse.json({ data: [] })),
    );
    renderApp('/account/buy-again');
    await userEvent.click(await screen.findByTestId('account-menu-button'));
    expect(
      within(screen.getByTestId('account-menu')).getByRole('link', { name: 'Buy again' }),
    ).toBeInTheDocument();
  });
});

describe('reorder from an order', () => {
  it('adds what it can and lists what it skipped, with the reason', async () => {
    const order = makeCustomerOrder({ number: 'PW-2026-000001', status: 'delivered' });
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders/${order.number}`, () => HttpResponse.json({ data: order })),
      http.post(`${API}/me/orders/${order.number}/reorder`, () =>
        HttpResponse.json({
          data: {
            cart: makeCart(),
            added: [{ name: 'Squeaky bone', variantName: 'Large', quantity: 2 }],
            skipped: [{ name: 'Cat tower', variantName: 'Grey', reason: 'sold_out' }],
          },
        }),
      ),
    );
    renderApp(`/account/orders/${order.number}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Buy these again' }));
    expect(await screen.findByText(/Added 1 item to your cart/)).toBeInTheDocument();
    expect(screen.getByTestId('reorder-skipped')).toHaveTextContent(
      'Cat tower (Grey): sold out right now',
    );
  });

  it('is not offered on a cancelled order', async () => {
    const order = makeCustomerOrder({ number: 'PW-2026-000002', status: 'cancelled' });
    server.use(
      signedInAs(),
      http.get(`${API}/account/orders/${order.number}`, () => HttpResponse.json({ data: order })),
    );
    renderApp(`/account/orders/${order.number}`);
    await screen.findByTestId('page-order-detail');
    expect(screen.queryByRole('button', { name: 'Buy these again' })).toBeNull();
  });
});

describe('your usuals (G9.2)', () => {
  const usuals = (
    items: object[],
    lastOrder: object | null = { number: 'GR-2026-000042', placedAt: '2026-11-20T10:00:00.000Z' },
  ) => http.get(`${API}/me/usuals`, () => HttpResponse.json({ data: { items, lastOrder } }));

  it('shows the strip on the home page for a signed-in shopper, most often first', async () => {
    server.use(
      signedInAs(),
      usuals([
        item({ name: 'Milk', timesBought: 5 }),
        item({ variantId: 'v-2', name: 'Bread', timesBought: 2 }),
      ]),
    );
    renderApp('/');
    const strip = within(await screen.findByTestId('usuals'));
    expect(strip.getByRole('heading', { name: 'Your usuals' })).toBeVisible();
    const rows = strip.getAllByTestId('usuals-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Milk');
    expect(rows[0]).toHaveTextContent('in 5 recent orders');
    expect(rows[1]).toHaveTextContent('in 2 recent orders');
  });

  it('shows nothing for a visitor and nothing before the first order', async () => {
    renderApp('/');
    await screen.findByTestId('guides-teaser');
    expect(screen.queryByTestId('usuals')).not.toBeInTheDocument();
  });

  it('shows nothing when the shopper has no order yet', async () => {
    server.use(signedInAs(), usuals([], null));
    renderApp('/');
    await screen.findByTestId('guides-teaser');
    expect(screen.queryByTestId('usuals')).not.toBeInTheDocument();
  });

  it('reorders the last basket and lists what is not in stock at the store', async () => {
    let called: string | null = null;
    server.use(
      signedInAs(),
      usuals([item()]),
      http.post(`${API}/me/orders/:id/reorder`, ({ params }) => {
        called = String(params.id);
        return HttpResponse.json({
          data: {
            cart: makeCart([]),
            added: [{ name: 'Squeaky bone', variantName: 'Large', quantity: 1 }],
            skipped: [{ name: 'Cat tower', variantName: 'Tall', reason: 'sold_out' }],
          },
        });
      }),
    );
    renderApp('/account/buy-again');
    await userEvent.click(await screen.findByRole('button', { name: 'Reorder last basket' }));
    expect(await screen.findByText(/Cat tower \(Tall\): sold out right now/)).toBeVisible();
    expect(called).toBe('GR-2026-000042');
  });
});
