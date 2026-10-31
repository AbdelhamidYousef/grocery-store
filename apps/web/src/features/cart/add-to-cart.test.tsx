import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as tracking from '../../lib/track';
import { makeCart, makeCartItem } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('add to cart from the product page', () => {
  it('posts the variant and quantity, tracks it, and toasts with a link to the cart', async () => {
    const spy = vi.spyOn(tracking, 'track').mockImplementation(() => undefined);
    let body: unknown;
    server.use(
      http.post(`${API}/cart/items`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: makeCart([makeCartItem({ quantity: 2, lineTotalCents: 2198 })]),
        });
      }),
    );
    const router = renderApp('/products/rope-tug');
    await userEvent.click(await screen.findByRole('button', { name: 'Increase quantity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(await screen.findByText('Added 2 x Rope Tug to your cart')).toBeInTheDocument();
    expect(body).toMatchObject({ quantity: 2 });
    expect(body).toHaveProperty('variantId');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ name: 'add_to_cart', quantity: 2 }));
    // The header badge now reads the cart the POST returned.
    expect(screen.getByTestId('cart-count')).toHaveTextContent('2');

    await userEvent.click(screen.getByTestId('toast-action'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'));
  });

  it('turns a 409 OUT_OF_STOCK into a message with the numbers, and does not track', async () => {
    const spy = vi.spyOn(tracking, 'track').mockImplementation(() => undefined);
    server.use(
      http.post(`${API}/cart/items`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'OUT_OF_STOCK',
              message: 'Not enough stock',
              details: { variantId: 'v1', maxQty: 3, inCart: 2, requested: 4 },
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderApp('/products/rope-tug');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
    expect(
      await screen.findByText('Only 3 available, and you have 2 in your cart.'),
    ).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'add_to_cart' }));
  });

  it('shows a loading state and cannot be pressed twice while the request runs', async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    server.use(
      http.post(`${API}/cart/items`, async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json({ data: makeCart([makeCartItem()]) });
      }),
    );
    renderApp('/products/rope-tug');
    const button = await screen.findByRole('button', { name: 'Add to cart' });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    release();
    await screen.findByText(/Added 1 x Rope Tug/);
    expect(calls).toBe(1);
  });
});

describe('header cart badge', () => {
  it('shows the item count from GET /cart', async () => {
    server.use(
      http.get(`${API}/cart`, () =>
        HttpResponse.json({
          data: makeCart([makeCartItem({ quantity: 3, lineTotalCents: 3297 })]),
        }),
      ),
    );
    renderApp('/');
    expect(await screen.findByTestId('cart-count')).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: 'Cart, 3 items' })).toBeInTheDocument();
  });
});
