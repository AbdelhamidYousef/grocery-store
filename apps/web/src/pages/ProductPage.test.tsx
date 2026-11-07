import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import * as tracking from '../lib/track';
import { makeProduct, makeVariant } from '../test/fixtures';
import { renderApp } from '../test/render';
import { API, server, signedInAs } from '../test/server';

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

describe('product page: flash sale (Omnibus)', () => {
  const serveSale = (referenceCents: number | null) =>
    server.use(
      http.get(`${API}/products/rope-tug`, () =>
        HttpResponse.json({
          data: makeProduct({
            variants: [
              makeVariant({
                id: 'v1',
                sku: 'S',
                isDefault: true,
                options: { color: 'red', size: 'S' },
                priceCents: 1099,
                sale: {
                  priceCents: 799,
                  referenceCents,
                  basePriceCents: 1099,
                  endsAt: '2026-11-08T10:00:00.000Z',
                },
              }),
            ],
          }),
        }),
      ),
    );

  it('shows the sale price with the lowest price of the last 30 days', async () => {
    serveSale(999);
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('sale-price')).toHaveTextContent('€7.99');
    expect(screen.getByTestId('sale-strike')).toHaveTextContent('Was €9.99');
    expect(screen.getByTestId('sale-omnibus')).toHaveTextContent(
      'Lowest price in the last 30 days: €9.99',
    );
  });

  it('shows no strike-through without a reference price', async () => {
    serveSale(null);
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('sale-price')).toHaveTextContent('€7.99');
    expect(screen.queryByTestId('sale-strike')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sale-omnibus')).not.toBeInTheDocument();
  });
});

describe('product page: member price', () => {
  const sale = {
    priceCents: 1400,
    referenceCents: 2000,
    basePriceCents: 2000,
    endsAt: '2030-01-01T00:00:00.000Z',
  };
  const serve = (variant: Partial<ReturnType<typeof makeVariant>>) =>
    server.use(
      http.get(`${API}/products/rope-tug`, () =>
        HttpResponse.json({
          data: makeProduct({
            variants: [
              makeVariant({ id: 'v1', sku: 'A', isDefault: true, priceCents: 2000, ...variant }),
            ],
          }),
        }),
      ),
    );

  it('teases a guest with a login link that returns to this product', async () => {
    serve({ hasMemberPrice: true });
    renderApp('/products/rope-tug');
    const teaser = await screen.findByTestId('member-teaser');
    expect(teaser).toHaveTextContent('Member price: log in to see');
    expect(teaser).toHaveAttribute('href', '/login?next=%2Fproducts%2Frope-tug');
    expect(screen.queryByTestId('member-price')).not.toBeInTheDocument();
  });

  it('shows no teaser when the variant has no member price', async () => {
    serve({ hasMemberPrice: false });
    renderApp('/products/rope-tug');
    await screen.findByTestId('price-current');
    expect(screen.queryByTestId('member-teaser')).not.toBeInTheDocument();
  });

  it('shows a member their price and no teaser', async () => {
    server.use(signedInAs());
    serve({ hasMemberPrice: true, member: { priceCents: 1743 } });
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('member-price')).toHaveTextContent('Member price €17.43');
    expect(screen.getByText(/Regular price €20.00/)).toBeInTheDocument();
    expect(screen.queryByTestId('member-teaser')).not.toBeInTheDocument();
  });

  it('shows the sale when it is lower than the member price', async () => {
    server.use(signedInAs());
    serve({ hasMemberPrice: true, member: { priceCents: 1743 }, sale });
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('sale-price')).toHaveTextContent('€14.00');
    expect(screen.queryByTestId('member-price')).not.toBeInTheDocument();
  });

  it('shows the member price when it is lower than the sale price', async () => {
    server.use(signedInAs());
    serve({
      hasMemberPrice: true,
      member: { priceCents: 1743 },
      sale: { ...sale, priceCents: 1800 },
    });
    renderApp('/products/rope-tug');
    expect(await screen.findByTestId('member-price')).toHaveTextContent('€17.43');
    expect(screen.queryByTestId('sale-price')).not.toBeInTheDocument();
  });
});
