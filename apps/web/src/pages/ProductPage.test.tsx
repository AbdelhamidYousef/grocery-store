import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import * as tracking from '../lib/track';
import { makeProduct, makeVariant } from '../test/fixtures';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

describe('product page', () => {
  it('shows name, default variant price, breadcrumb, description and attributes', async () => {
    const spy = vi.spyOn(tracking, 'track').mockImplementation(() => undefined);
    renderApp('/products/rope-tug');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rope Tug' })).toBeInTheDocument();
    expect(screen.getByTestId('price-current')).toHaveTextContent('€10.99');
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(crumbs.getByRole('link', { name: 'Dogs' })).toHaveAttribute('href', '/c/dogs');
    expect(crumbs.getByRole('link', { name: 'Toys' })).toHaveAttribute('href', '/c/dog-toys');
    expect(screen.getByText('A sturdy braided tug for happy games.')).toBeInTheDocument();
    const attrs = within(screen.getByTestId('product-attributes'));
    expect(attrs.getByText('Material')).toBeInTheDocument();
    expect(attrs.getByText('Cotton rope')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ name: 'view_item' }));
    expect(document.title).toBe('Rope Tug | Pawsome');
    spy.mockRestore();
  });

  it('gives the main image dimensions and swaps it from the thumbnails', async () => {
    renderApp('/products/rope-tug');
    const main = await screen.findByTestId('gallery-main');
    expect(main).toHaveAttribute('width', '1200');
    expect(main).toHaveAttribute('alt', 'Rope tug, front');

    const thumbs = screen.getAllByRole('radio', { name: /Image \d of 2/ });
    expect(thumbs[0]).toBeChecked();
    await userEvent.click(thumbs[1] as HTMLElement);
    expect(screen.getByTestId('gallery-main')).toHaveAttribute('alt', 'Rope tug, in use');
  });

  it('marks a sold-out product', async () => {
    server.use(
      http.get(`${API}/products/rope-tug`, () =>
        HttpResponse.json({
          data: makeProduct({
            inStock: false,
            variants: [makeVariant({ available: false, isDefault: true })],
          }),
        }),
      ),
    );
    renderApp('/products/rope-tug');
    expect((await screen.findAllByText('Sold out')).length).toBeGreaterThan(0);
  });

  it('shows the not-found page for an unknown product', async () => {
    renderApp('/products/nope');
    expect(
      await screen.findByRole('heading', { level: 1, name: "We can't find that product" }),
    ).toBeInTheDocument();
  });

  it('shows an error with retry when the request fails', async () => {
    server.use(http.get(`${API}/products/rope-tug`, () => HttpResponse.json({}, { status: 500 })));
    renderApp('/products/rope-tug');
    expect(
      await screen.findByRole('heading', { name: 'We could not load this product' }),
    ).toBeInTheDocument();
  });
});

describe('product page: unit price, badges and trial size', () => {
  const serve = (product: ReturnType<typeof makeProduct>) =>
    server.use(http.get(`${API}/products/rope-tug`, () => HttpResponse.json({ data: product })));

  it('shows the unit price of the selected variant and the rounding note', async () => {
    serve(
      makeProduct({
        badges: ['New', 'Eco'],
        variants: [
          makeVariant({
            id: 'v1',
            sku: 'A',
            isDefault: true,
            options: { color: 'red', size: 'S' },
            unitPrice: { cents: 420, per: 'kg' },
          }),
        ],
      }),
    );
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('unit-price')).toHaveTextContent('€4.20/kg');
    expect(screen.getByText(/rounded to the nearest cent/)).toBeInTheDocument();
    expect(screen.getAllByTestId('product-badge').map((b) => b.textContent)).toEqual([
      'New',
      'Eco',
    ]);
    expect(screen.queryByTestId('trial-pill')).not.toBeInTheDocument();
  });

  it('marks a trial size with a pill and the one-per-customer note', async () => {
    serve(
      makeProduct({
        variants: [
          makeVariant({
            id: 'v1',
            sku: 'T',
            isDefault: true,
            options: { color: 'red', size: 'S' },
            isTrial: true,
          }),
        ],
      }),
    );
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('trial-pill')).toHaveTextContent('Trial size');
    expect(screen.getByTestId('trial-note')).toHaveTextContent('one per customer');
  });

  it('shows the server message when a second trial is refused (409 TRIAL_LIMIT)', async () => {
    serve(
      makeProduct({
        variants: [
          makeVariant({
            id: 'v1',
            sku: 'T',
            isDefault: true,
            options: { color: 'red', size: 'S' },
            isTrial: true,
          }),
        ],
      }),
    );
    server.use(
      http.post(`${API}/cart/items`, () =>
        HttpResponse.json(
          { error: { code: 'TRIAL_LIMIT', message: 'You have already had this trial size' } },
          { status: 409 },
        ),
      ),
    );
    renderApp('/products/rope-tug');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText('You have already had this trial size')).toBeInTheDocument();
  });
});
