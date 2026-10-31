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
