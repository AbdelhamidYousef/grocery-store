import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/render';
import { API, server, signedInAs } from '../../test/server';

describe('auth state and guards', () => {
  it('sends a visitor from /account to the login page, remembering where they were going', async () => {
    const router = renderApp('/account/addresses');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=%2Faccount%2Faddresses');
  });

  it('lets a signed-in customer into /account', async () => {
    server.use(signedInAs());
    const router = renderApp('/account');
    expect(await screen.findByTestId('page-account')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
  });

  it('shows a signed-in customer a no-access page on /admin', async () => {
    server.use(signedInAs());
    renderApp('/admin');
    expect(await screen.findByTestId('page-forbidden')).toBeInTheDocument();
  });

  it('lets an admin into /admin', async () => {
    server.use(signedInAs({ role: 'admin' }));
    renderApp('/admin');
    expect(await screen.findByTestId('page-admin')).toBeInTheDocument();
  });

  it('shows the name and My account / Sign out in the menu when signed in', async () => {
    server.use(signedInAs({ firstName: 'Robin' }));
    renderApp('/');
    await waitFor(() => expect(screen.getByTestId('account-name')).toHaveTextContent('Robin'));
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    const menu = within(screen.getByTestId('account-menu'));
    expect(menu.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account');
    expect(menu.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('signs out: calls the API, clears the user and goes home', async () => {
    let loggedOut = false;
    server.use(
      signedInAs(),
      http.post(`${API}/auth/logout`, () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const router = renderApp('/c/dogs');
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(loggedOut).toBe(true));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
