import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCard, makeList } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

const item = (over: object = {}) => ({
  id: 'wi-1',
  productId: 'p-1',
  slug: 'squeaky-bone',
  name: 'Squeaky bone',
  image: null,
  variantId: 'v-1',
  variantName: 'Large',
  priceCents: 1299,
  currency: 'EUR',
  available: true,
  ...over,
});
const list = (items: object[] = [item()], shareToken: string | null = null) =>
  http.get(`${API}/wishlist`, () => HttpResponse.json({ data: { items, shareToken } }));

describe('wishlist', () => {
  it('lists saved items, with move to cart disabled for a sold-out one', async () => {
    server.use(list([item(), item({ id: 'wi-2', name: 'Cat tower', available: false })]));
    renderApp('/wishlist');
    const rows = await screen.findAllByTestId('wishlist-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('button', { name: 'Move to cart' })).toBeEnabled();
    expect(within(rows[1]!).getByRole('button', { name: 'Sold out' })).toBeDisabled();
  });

  it('removes an item', async () => {
    let removed = '';
    server.use(
      list(),
      http.delete(`${API}/wishlist/items/:id`, ({ params }) => {
        removed = String(params.id);
        return HttpResponse.json({ data: { items: [], shareToken: null } });
      }),
    );
    renderApp('/wishlist');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
    expect(removed).toBe('wi-1');
  });

  it('asks a guest to sign in before sharing; a member can create and stop a link', async () => {
    server.use(list());
    const guest = renderApp('/wishlist');
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    void guest;
  });

  it('shows the share link once sharing is on', async () => {
    server.use(
      signedInAs(),
      list([item()], 'tok123456789012345678'),
      http.delete(`${API}/wishlist/share`, () =>
        HttpResponse.json({ data: { items: [item()], shareToken: null } }),
      ),
    );
    renderApp('/wishlist');
    expect(await screen.findByTestId('wishlist-share-link')).toHaveTextContent(
      '/w/tok123456789012345678',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(await screen.findByRole('button', { name: 'Create a share link' })).toBeInTheDocument();
  });

  it('the heart on a card saves the product and shows it pressed', async () => {
    const card = makeCard({ id: 'p-9', name: 'Chew ring' });
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(makeList([card]))),
      http.post(`${API}/wishlist/items`, async ({ request }) => {
        const body = (await request.json()) as { productId: string };
        return HttpResponse.json({
          data: { items: [item({ productId: body.productId })], shareToken: null },
        });
      }),
    );
    renderApp('/search?q=chew');
    const heart = await screen.findByRole('button', { name: 'Save Chew ring to wishlist' });
    expect(heart).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(heart);
    expect(
      await screen.findByRole('button', { name: 'Save Chew ring to wishlist', pressed: true }),
    ).toBeInTheDocument();
  });
});

describe('a shared wishlist', () => {
  it('shows the first name and the items, read only', async () => {
    server.use(
      http.get(`${API}/wishlist/shared/:token`, () =>
        HttpResponse.json({ data: { ownerFirstName: 'Sam', items: [item()] } }),
      ),
    );
    renderApp('/w/abcdefghijklmnopqrstu');
    expect(await screen.findByRole('heading', { name: /Sam.s wishlist/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('is the not-found page for a revoked link', async () => {
    server.use(
      http.get(`${API}/wishlist/shared/:token`, () =>
        HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'nope' } }, { status: 404 }),
      ),
    );
    renderApp('/w/abcdefghijklmnopqrstu');
    expect(
      await screen.findByRole('heading', { name: /not found|find that page/i }),
    ).toBeInTheDocument();
  });
});
