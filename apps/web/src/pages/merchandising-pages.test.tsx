import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import * as tracking from '../lib/track';
import { makeBrand, makeCard, makeCollection, makeFacets, makeList } from '../test/fixtures';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

import { untilLabel } from './CollectionPage';

const notFound = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });

describe('brands page', () => {
  it('lists the brands with their taglines and product counts, linking to each', async () => {
    const spy = vi.spyOn(tracking, 'track').mockImplementation(() => undefined);
    server.use(
      http.get(`${API}/brands`, () =>
        HttpResponse.json({
          data: [
            makeBrand(),
            makeBrand({ id: 'b2', slug: 'tidepool', name: 'Tidepool', productCount: 1 }),
          ],
        }),
      ),
    );
    renderApp('/brands');
    const cards = await screen.findAllByTestId('brand-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('href', '/brands/scaleby');
    expect(within(cards[0]!).getByText('12 products')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('1 product')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith({ name: 'view_brands' });
    expect(document.title).toBe('Brands | Grocery');
  });

  it('says so, with a retry, when the brands cannot load', async () => {
    server.use(http.get(`${API}/brands`, () => HttpResponse.json({}, { status: 500 })));
    renderApp('/brands');
    expect(await within(screen.getByRole('main')).findByRole('alert')).toHaveTextContent(
      'could not load the brands',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('brand page', () => {
  it('shows the story, lists only that brand and hides the brand facet', async () => {
    const spy = vi.spyOn(tracking, 'track').mockImplementation(() => undefined);
    let seen = '';
    server.use(
      http.get(`${API}/brands/:slug`, () => HttpResponse.json({ data: makeBrand() })),
      http.get(`${API}/products`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json(
          makeList([makeCard()], {
            facets: makeFacets({
              brand: [
                { value: 'scaleby', label: 'Scaleby', count: 3 },
                { value: 'pawsome', label: 'Pawsome', count: 2 },
              ],
            }),
          }),
        );
      }),
    );
    renderApp('/brands/scaleby');
    expect(await screen.findByRole('heading', { level: 1, name: 'Scaleby' })).toBeInTheDocument();
    expect(screen.getByText(/terrariums and heat gear/)).toBeInTheDocument();
    await screen.findAllByTestId('product-card');
    expect(seen).toContain('brand=scaleby');
    expect(screen.queryByRole('group', { name: 'Brand' })).not.toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith({ name: 'view_brand', slug: 'scaleby' });
  });

  it('shows the not-found page for an unknown brand', async () => {
    server.use(http.get(`${API}/brands/:slug`, notFound));
    renderApp('/brands/nope');
    expect(await screen.findByRole('heading', { name: /find that brand/ })).toBeInTheDocument();
  });
});

describe('collection page', () => {
  it('shows the collection, its end date and asks the api for its products', async () => {
    const spy = vi.spyOn(tracking, 'track').mockImplementation(() => undefined);
    let seen = '';
    server.use(
      http.get(`${API}/collections/:slug`, () => HttpResponse.json({ data: makeCollection() })),
      http.get(`${API}/products`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json(makeList([makeCard()]));
      }),
    );
    renderApp('/collections/halloween');
    expect(await screen.findByRole('heading', { level: 1, name: 'Halloween' })).toBeInTheDocument();
    // The window ends at the start of 3 November, so the last day is the 2nd.
    expect(screen.getByText('Until 2 November')).toBeInTheDocument();
    await screen.findAllByTestId('product-card');
    expect(seen).toContain('collection=halloween');
    expect(spy).toHaveBeenCalledWith({ name: 'view_collection', slug: 'halloween' });
  });

  it('treats a collection outside its window (404) as not found', async () => {
    server.use(http.get(`${API}/collections/:slug`, notFound));
    renderApp('/collections/halloween');
    expect(
      await screen.findByRole('heading', { name: /find that collection/ }),
    ).toBeInTheDocument();
  });

  it('has no end date line for an evergreen collection', async () => {
    server.use(
      http.get(`${API}/collections/:slug`, () =>
        HttpResponse.json({
          data: makeCollection({
            slug: 'eco-picks',
            name: 'Eco Picks',
            startsAt: null,
            endsAt: null,
          }),
        }),
      ),
      http.get(`${API}/products`, () => HttpResponse.json(makeList([makeCard()]))),
    );
    renderApp('/collections/eco-picks');
    await screen.findByRole('heading', { level: 1, name: 'Eco Picks' });
    expect(screen.queryByText(/^Until/)).not.toBeInTheDocument();
  });
});

describe('untilLabel', () => {
  it('is the day before the exclusive end, and null without one', () => {
    expect(untilLabel('2026-12-28T00:00:00.000Z')).toBe('Until 27 December');
    expect(untilLabel(null)).toBeNull();
  });
});
