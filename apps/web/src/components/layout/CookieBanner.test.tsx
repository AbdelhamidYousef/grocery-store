import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONSENT_KEY, hasConsent } from '../../lib/consent';
import { renderApp } from '../../test/render';

beforeEach(() => window.localStorage.clear());

describe('cookie banner', () => {
  it('says only necessary cookies are used and shows OK and Cookie details', async () => {
    renderApp('/');
    const banner = await screen.findByTestId('cookie-banner');
    expect(banner).toHaveTextContent('only use cookies that are strictly necessary');
    expect(banner).toHaveTextContent('No analytics or marketing cookies are set.');
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cookie details' })).toHaveAttribute(
      'href',
      '/cookies',
    );
  });

  it('shows once: OK hides it and it stays hidden on the next visit', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'OK' }));
    expect(screen.queryByTestId('cookie-banner')).toBeNull();
    expect(window.localStorage.getItem(CONSENT_KEY)).not.toBeNull();
    // A fresh mount of the app (a reload) reads the stored choice.
    document.body.innerHTML = '';
    renderApp('/');
    await screen.findByTestId('footer');
    expect(screen.queryByTestId('cookie-banner')).toBeNull();
  });

  it('opens the cookies page from Cookie details and counts that as seen', async () => {
    const user = userEvent.setup();
    const router = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Cookie details' }));
    expect(router.state.location.pathname).toBe('/cookies');
    expect(screen.queryByTestId('cookie-banner')).toBeNull();
  });

  it('never grants analytics, whatever the visitor clicks', async () => {
    const user = userEvent.setup();
    renderApp('/');
    expect(hasConsent('analytics')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'OK' }));
    expect(hasConsent('analytics')).toBe(false);
    expect(hasConsent('marketing')).toBe(false);
  });
});
