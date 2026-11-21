import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from './components/layout/AppLayout';
import RouteErrorPage from './pages/RouteErrorPage';
import { renderApp } from './test/render';
import { server, signedInAs } from './test/server';

afterEach(() => {
  vi.restoreAllMocks();
});

const renderAt = renderApp;

describe('routes', () => {
  it.each([
    ['/', 'Groceries at your door in 30 minutes'],
    ['/c/dairy-eggs', 'Dairy & eggs'],
    ['/products/rope-tug', 'Rope Tug'],
    ['/search', 'Search'],
    ['/cart', 'Your cart'],
    ['/login', 'Sign in'],
    ['/register', 'Create account'],
  ])('renders %s inside the layout', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it.each([
    ['/checkout', 'Checkout'],
    ['/checkout/confirmation/PW-2026-000001', 'Confirming your payment…'],
    ['/account', 'My account'],
    ['/account/orders/12', 'My account'],
    ['/admin', 'Admin'],
    ['/admin/products', 'Admin'],
  ])('lazy-loads %s', async (path, heading) => {
    // The account and admin areas are behind guards; an admin passes both.
    server.use(signedInAs({ role: 'admin' }));
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('themes the category page with its department colours', async () => {
    renderAt('/c/bakery');
    await screen.findByRole('heading', { level: 1, name: 'Bakery' });
    const page = screen.getByTestId('page-category');
    expect(page).toHaveAttribute('data-dept', 'bakery');
  });

  it('shows the not-found page for unknown urls, still inside the layout', async () => {
    renderAt('/definitely/not/here');
    expect(
      await screen.findByRole('heading', { level: 1, name: "We can't find that page" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('navigates client-side from the header without a page load', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(
      within(screen.getByTestId('main-nav')).getByRole('link', { name: 'Bakery' }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Bakery' })).toBeInTheDocument();
  });

  it('moves focus to main after a client-side navigation', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(
      within(screen.getByTestId('main-nav')).getByRole('link', { name: 'Bakery' }),
    );
    await screen.findByRole('heading', { level: 1, name: 'Bakery' });
    expect(screen.getByTestId('main')).toHaveFocus();
  });

  it('keeps the layout and shows the error page when a route throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Boom(): never {
      throw new Error('kaboom');
    }
    renderAt('/boom', [
      {
        element: <AppLayout />,
        children: [
          {
            errorElement: <RouteErrorPage />,
            children: [{ path: 'boom', element: <Boom /> }],
          },
        ],
      },
    ]);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('alert')).toHaveTextContent('try again');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
