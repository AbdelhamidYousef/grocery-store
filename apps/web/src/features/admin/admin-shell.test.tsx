import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeAdminStats } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

beforeEach(() => {
  server.use(signedInAs({ role: 'admin' }));
});

describe('admin shell', () => {
  it('sends a guest to the login page with a way back', async () => {
    server.use(
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 }),
      ),
    );
    const router = renderApp('/admin/products');
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toContain('next=');
  });

  it('shows a customer the no-access page and never fetches admin data', async () => {
    let called = false;
    server.use(
      signedInAs({ role: 'customer' }),
      http.get(`${API}/admin/stats`, () => {
        called = true;
        return HttpResponse.json({ data: makeAdminStats() });
      }),
    );
    renderApp('/admin');
    expect(await screen.findByTestId('page-forbidden')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('shows the menu with the current section marked, and marks the page noindex', async () => {
    server.use(http.get(`${API}/admin/stats`, () => HttpResponse.json({ data: makeAdminStats() })));
    renderApp('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      'Dashboard',
      'Products',
      'Orders',
      'Reviews',
      'Gallery',
      'Brands',
      'Collections',
      'Tags',
      'Navigation',
      'Promotions',
      'Size guides',
      'Kits',
      'Guides',
      'Help articles',
      'Testimonials',
      'Safety notices',
      'Withdrawals',
      'Messages',
      'Homepage',
    ]);
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    );
  });

  it('shows the dashboard numbers', async () => {
    server.use(
      http.get(`${API}/admin/stats`, () =>
        HttpResponse.json({ data: makeAdminStats({ ordersToday: 7, lowStockCount: 0 }) }),
      ),
    );
    renderApp('/admin');
    const tiles = await screen.findAllByTestId('admin-stat');
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveTextContent('Orders today7');
    expect(tiles[1]).toHaveTextContent('1,234.56');
    expect(tiles[2]).toHaveTextContent('0');
  });

  it('offers a retry when the numbers cannot be loaded', async () => {
    server.use(
      http.get(`${API}/admin/stats`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 400 }),
      ),
    );
    renderApp('/admin');
    expect(await screen.findByText('We could not load the numbers.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a not-found message inside the shell for an unknown admin page', async () => {
    renderApp('/admin/nope');
    expect(await screen.findByTestId('admin-not-found')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument();
  });
});
