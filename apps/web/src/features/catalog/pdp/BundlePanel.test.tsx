import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeProduct } from '../../../test/fixtures';
import { renderApp } from '../../../test/render';
import { API, server } from '../../../test/server';

const part = (over: Record<string, unknown>) => ({
  variantId: 'c1',
  productSlug: 'rope',
  productName: 'Rope',
  variantName: 'Red',
  qty: 2,
  priceCents: 1000,
  ...over,
});

describe('kits on the product page', () => {
  it('lists what is inside a kit and the saving in euros', async () => {
    server.use(
      http.get(`${API}/products/rope-tug`, () =>
        HttpResponse.json({
          data: makeProduct({
            bundle: {
              variantId: 'v1',
              components: [
                part({}),
                part({ variantId: 'c2', productName: 'Ball', qty: 1, priceCents: 500 }),
              ],
              individualCents: 2500,
              savingCents: 300,
            },
          }),
        }),
      ),
    );
    renderApp('/products/rope-tug');
    const panel = await screen.findByTestId('bundle-panel');
    expect(within(panel).getByRole('link', { name: /2 x Rope/ })).toHaveAttribute(
      'href',
      '/products/rope',
    );
    expect(within(panel).getByText('€20.00')).toBeInTheDocument();
    expect(screen.getByTestId('bundle-saving')).toHaveTextContent(
      'Save €3.00 vs individually (€25.00)',
    );
  });

  it('offers the kits a component is part of, with a sold-out note', async () => {
    server.use(
      http.get(`${API}/products/rope-tug`, () =>
        HttpResponse.json({
          data: makeProduct({
            kits: [
              {
                slug: 'play-kit',
                name: 'Play Kit',
                variantId: 'k1',
                priceCents: 2200,
                individualCents: 2500,
                savingCents: 300,
                available: false,
                contents: 'Ball, 2 x Rope',
              },
            ],
          }),
        }),
      ),
    );
    renderApp('/products/rope-tug');
    const block = await screen.findByTestId('kits-block');
    expect(within(block).getByRole('link', { name: 'Play Kit' })).toHaveAttribute(
      'href',
      '/products/play-kit',
    );
    expect(within(block).getByText('Ball, 2 x Rope')).toBeInTheDocument();
    expect(within(block).getByText('Save €3.00')).toBeInTheDocument();
    expect(within(block).getByText('Sold out')).toBeInTheDocument();
  });

  it('shows neither block on an ordinary product', async () => {
    renderApp('/products/rope-tug');
    await screen.findByRole('heading', { level: 1, name: 'Rope Tug' });
    expect(screen.queryByTestId('bundle-panel')).toBeNull();
    expect(screen.queryByTestId('kits-block')).toBeNull();
  });
});
