import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import * as tracking from '../lib/track';
import { renderApp } from '../test/render';
import { server, API } from '../test/server';

describe('home page', () => {
  it('shows the hero, five pet tiles with counts and the new arrivals', async () => {
    const spy = vi.spyOn(tracking, 'track');
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Happy tails start here');

    const tiles = within(screen.getByTestId('pet-tiles'));
    expect(tiles.getAllByRole('link')).toHaveLength(5);
    expect(await tiles.findByText('10 products')).toBeInTheDocument();

    const cards = await screen.findAllByTestId('product-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('href', '/products/rope-tug');
    expect(spy).toHaveBeenCalledWith({ name: 'view_home' });
  });

  it('keeps the page usable when new arrivals fail to load', async () => {
    server.use(http.get(`${API}/products`, () => HttpResponse.json({}, { status: 500 })));
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load new arrivals');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
