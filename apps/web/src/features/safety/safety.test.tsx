import type { SafetyNotice } from '@store/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeProduct } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

const notice = (over: Partial<SafetyNotice> = {}): SafetyNotice => ({
  id: 'n1',
  title: 'Red rope recall',
  bodyMd: 'Please **stop using** the red rope.',
  severity: 'recall',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: null,
  ...over,
});
const serve = (list: SafetyNotice[]) =>
  server.use(http.get(`${API}/safety-notices/active`, () => HttpResponse.json({ data: list })));

beforeEach(() => window.sessionStorage.clear());

describe('homepage safety banner', () => {
  it('shows an active notice and a recall is announced as an alert', async () => {
    serve([notice()]);
    renderApp('/');
    const banner = within(await screen.findByTestId('safety-banner'));
    expect(banner.getByRole('alert')).toHaveTextContent('Red rope recall');
    expect(banner.getByText('stop using').tagName).toBe('STRONG');
  });

  it('uses no alert role for a warning or an info notice', async () => {
    serve([
      notice({ id: 'w', severity: 'warning', title: 'Chew warning' }),
      notice({ id: 'i', severity: 'info', title: 'Good to know' }),
    ]);
    renderApp('/');
    const banner = within(await screen.findByTestId('safety-banner'));
    expect(banner.getAllByTestId('safety-notice')).toHaveLength(2);
    expect(banner.queryByRole('alert')).toBeNull();
    // The severity is written as a word, not only coloured.
    expect(banner.getByText(/Safety warning:/)).toBeInTheDocument();
  });

  it('can be dismissed for the session and stays dismissed on the next visit', async () => {
    serve([notice()]);
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Dismiss: Red rope recall' }));
    expect(screen.queryByTestId('safety-banner')).toBeNull();
    document.body.innerHTML = '';
    renderApp('/');
    await screen.findByTestId('page-home');
    expect(screen.queryByTestId('safety-banner')).toBeNull();
  });

  it('renders nothing when there are no notices', async () => {
    renderApp('/');
    await screen.findByTestId('page-home');
    expect(screen.queryByTestId('safety-banner')).toBeNull();
  });
});

describe('product page notice box', () => {
  it('shows the notices of the product and cannot be dismissed', async () => {
    server.use(
      http.get(`${API}/products/rope-tug`, () =>
        HttpResponse.json({ data: makeProduct({ safetyNotices: [notice()] }) }),
      ),
    );
    renderApp('/products/rope-tug');
    const box = await screen.findByTestId('safety-notice');
    expect(box).toHaveAttribute('role', 'alert');
    expect(within(box).queryByRole('button')).toBeNull();
  });

  it('shows no box for a product without notices', async () => {
    renderApp('/products/rope-tug');
    await screen.findByRole('heading', { level: 1, name: 'Rope Tug' });
    expect(screen.queryByTestId('safety-notice')).toBeNull();
  });
});
