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
