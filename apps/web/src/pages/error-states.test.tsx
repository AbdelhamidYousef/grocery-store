import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCart, makeCartItem } from '../test/fixtures';
import { renderApp } from '../test/render';
import { API, server, signedInAs } from '../test/server';

// What the shopper sees when the API fails or the URL is wrong, on the pages whose happy paths
// are tested next to their features. A 4xx is used for "failing" because the test client does not
// retry it, so the error shows at once.
const failure = () =>
  HttpResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'nope' } }, { status: 400 });

describe('error states', () => {
  it('cart page: offers a retry that loads the cart', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/cart`, () => {
        calls += 1;
        return calls === 1 ? failure() : HttpResponse.json({ data: makeCart([makeCartItem()]) });
      }),
    );
    renderApp('/cart');
    expect(await screen.findByText('We could not load your cart.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Items in your cart' })).toBeInTheDocument();
  });

  it('mini cart: a failed load shows a retry inside the drawer', async () => {
    let healthy = false;
    server.use(
      http.get(`${API}/cart`, () =>
        healthy ? HttpResponse.json({ data: makeCart() }) : failure(),
      ),
    );
    renderApp('/');
    await userEvent.click(await screen.findByTestId('mini-cart-button'));
    const retry = await screen.findByRole('button', { name: /We could not load your cart/ });
    healthy = true;
    await userEvent.click(retry);
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  });

  it('category page: a failing category shows a retry, an unknown one shows not found', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/categories/:slug`, () => {
        calls += 1;
        return failure();
      }),
    );
    renderApp('/c/dogs');
    expect(await screen.findByText('We could not load this category')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('We could not load this category');
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('category page: an unknown slug is the not-found page', async () => {
    renderApp('/c/no-such-category');
    expect(await screen.findByTestId('page-not-found')).toBeInTheDocument();
  });

  it('account area: an unknown section says so inside the account layout', async () => {
    server.use(signedInAs());
    renderApp('/account/nonsense');
    expect(await screen.findByTestId('account-not-found')).toBeInTheDocument();
  });
});
