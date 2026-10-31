import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { keys } from '../../lib/query-client';
import { TestProviders } from '../../test/render';
import { server, signedInAs } from '../../test/server';

import { SessionExpiredNotice } from './SessionExpiredNotice';

function setup(expired: boolean | undefined, signInNext?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (expired !== undefined) client.setQueryData(keys.sessionExpired, expired);
  render(
    <MemoryRouter>
      <SessionExpiredNotice {...(signInNext ? { signInNext } : {})} />
    </MemoryRouter>,
    { wrapper: ({ children }) => <TestProviders client={client}>{children}</TestProviders> },
  );
}

describe('<SessionExpiredNotice />', () => {
  it('stays hidden for an ordinary visitor', async () => {
    setup(undefined);
    await waitFor(() => expect(screen.queryByTestId('session-expired-notice')).toBeNull());
  });

  it('explains the sign-out and says the cart is still there', async () => {
    setup(true);
    const notice = await screen.findByTestId('session-expired-notice');
    expect(notice).toHaveTextContent('Your session expired');
    expect(notice).toHaveTextContent('Your cart is still here');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('offers a sign-in link that returns to the page when asked to', async () => {
    setup(true, '/checkout');
    expect(await screen.findByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcheckout',
    );
  });

  it('is hidden again once someone is signed in', async () => {
    server.use(signedInAs());
    setup(true);
    await waitFor(() => expect(screen.queryByTestId('session-expired-notice')).toBeNull());
  });
});
