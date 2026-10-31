import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from './components/layout/AppLayout';
import RouteErrorPage from './pages/RouteErrorPage';
import { renderApp } from './test/render';

afterEach(() => {
  vi.restoreAllMocks();
});

const renderAt = renderApp;

describe('routes', () => {
  it.each([
    ['/', 'Happy tails start here'],
    ['/c/dogs', 'Dogs'],
    ['/products/rope-tug', 'rope-tug'],
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
    ['/checkout/confirmation/PAW-1001', 'Thank you for your order'],
    ['/account', 'My account'],
    ['/account/orders/12', 'My account'],
    ['/admin', 'Admin'],
    ['/admin/products', 'Admin'],
  ])('lazy-loads %s', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('themes the category page with the pet accent', async () => {
    renderAt('/c/cats');
    await screen.findByRole('heading', { level: 1, name: 'Cats' });
    const page = screen.getByTestId('page-category');
    expect(page).toHaveAttribute('data-pet', 'cat');
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
      within(screen.getByTestId('main-nav')).getByRole('link', { name: 'Cats' }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Cats' })).toBeInTheDocument();
  });

  it('moves focus to main after a client-side navigation', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(
      within(screen.getByTestId('main-nav')).getByRole('link', { name: 'Cats' }),
    );
    await screen.findByRole('heading', { level: 1, name: 'Cats' });
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
    expect(screen.getByRole('alert')).toHaveTextContent('try again');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
