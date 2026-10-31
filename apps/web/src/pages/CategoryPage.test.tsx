import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeCard, makeList } from '../test/fixtures';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

describe('category page', () => {
  it('shows the category, a result count and the products', async () => {
    renderApp('/c/dogs');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dogs' })).toBeInTheDocument();
    expect(await screen.findAllByTestId('product-card')).toHaveLength(2);
    expect(screen.getByTestId('result-count')).toHaveTextContent('2 products');
    expect(screen.getByTestId('page-category')).toHaveAttribute('data-pet', 'dog');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Dogs');
  });

  it('turns the url into the api request (category, page, sort, filters)', async () => {
    let seen = '';
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json(makeList([makeCard()], { total: 60, page: 2 }));
      }),
    );
    renderApp('/c/dogs?page=2&sort=price_asc&attr.material=cotton%20rope&inStock=true&limit=500');
    await screen.findAllByTestId('product-card');
    const sent = new URLSearchParams(seen);
    expect(sent.get('category')).toBe('dogs');
    expect(sent.get('page')).toBe('2');
    expect(sent.get('sort')).toBe('price_asc');
    expect(sent.get('attr.material')).toBe('cotton rope');
    expect(sent.get('inStock')).toBe('true');
    expect(sent.get('limit')).toBe('24');
    expect(screen.getByTestId('result-count')).toHaveTextContent('Showing 25-25 of 60 products');
  });

  it('paginates through url links', async () => {
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(makeList([makeCard()], { total: 60 }))),
    );
    const router = renderApp('/c/dogs');
    await screen.findAllByTestId('product-card');
    await userEvent.click(
      within(screen.getByTestId('pagination')).getByRole('link', { name: /Next/ }),
    );
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'));
  });

  it('shows the not-found page for an unknown category', async () => {
    renderApp('/c/unicorns');
    expect(
      await screen.findByRole('heading', { level: 1, name: "We can't find that category" }),
    ).toBeInTheDocument();
  });

  it('offers to clear filters when they leave nothing, and clears them', async () => {
    server.use(
      http.get(`${API}/products`, ({ request }) =>
        HttpResponse.json(
          makeList(new URL(request.url).searchParams.has('inStock') ? [] : [makeCard()]),
        ),
      ),
    );
    const router = renderApp('/c/dogs?inStock=true&sort=name');
    expect(await screen.findByText('No products match')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('clear-filters'));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findAllByTestId('product-card')).toHaveLength(1);
  });

  it('shows an error with a retry when the list fails', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.json({}, { status: 500 })));
    renderApp('/c/dogs');
    expect(await within(screen.getByRole('main')).findByRole('alert')).toHaveTextContent(
      'could not load the products',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('handles a page number beyond the last page', async () => {
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({ ...makeList([], { total: 30 }), data: [] }),
      ),
    );
    renderApp('/c/dogs?page=99');
    expect(await screen.findByText('That page does not exist')).toBeInTheDocument();
  });
});
