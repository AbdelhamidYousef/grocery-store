import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { makeCard, makeCollection, makeList } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { API, server } from '../../test/server';

import { SeasonalCollectionSlot } from './SeasonalCollectionSlot';

const renderSlot = () =>
  renderWithProviders(
    <MemoryRouter>
      <SeasonalCollectionSlot />
    </MemoryRouter>,
  );

describe('SeasonalCollectionSlot', () => {
  it('shows the live seasonal collection with its products and a link', async () => {
    let seen = '';
    server.use(
      http.get(`${API}/collections`, () =>
        HttpResponse.json({
          data: [
            makeCollection({
              id: 'e',
              slug: 'eco-picks',
              name: 'Eco Picks',
              startsAt: null,
              endsAt: null,
            }),
            makeCollection(),
          ],
        }),
      ),
      http.get(`${API}/products`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json(makeList([makeCard()]));
      }),
    );
    renderSlot();
    const section = await screen.findByTestId('seasonal-collection');
    expect(section).toHaveTextContent('Halloween');
    expect(screen.getByRole('link', { name: 'See the whole collection' })).toHaveAttribute(
      'href',
      '/collections/halloween',
    );
    expect(seen).toContain('collection=halloween');
  });

  it('renders nothing when no seasonal collection is live (evergreen ones do not count)', async () => {
    let requested = false;
    server.use(
      http.get(`${API}/collections`, () => {
        requested = true;
        return HttpResponse.json({
          data: [
            makeCollection({ slug: 'eco-picks', name: 'Eco Picks', startsAt: null, endsAt: null }),
          ],
        });
      }),
    );
    renderSlot();
    // Wait for the request to have been answered before asserting that nothing appeared.
    await waitFor(() => expect(requested).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('seasonal-collection')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no collections at all', async () => {
    let requested = false;
    server.use(
      http.get(`${API}/collections`, () => {
        requested = true;
        return HttpResponse.json({ data: [] });
      }),
    );
    renderSlot();
    // Wait for the request to have been answered before asserting that nothing appeared.
    await waitFor(() => expect(requested).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('seasonal-collection')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
