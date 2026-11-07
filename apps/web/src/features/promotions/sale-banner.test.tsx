import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../test/render';
import { API, server } from '../../test/server';

import { formatCountdown, readDismissed } from './countdown';
import { SaleBanner } from './SaleBanner';

const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

// The server says it is `skewMs` ahead of this device. The sale times are server times.
function serveBanner(opts: {
  id?: string;
  status?: 'active' | 'scheduled';
  inMs: number;
  skewMs?: number;
}) {
  const serverNow = Date.now() + (opts.skewMs ?? 0);
  const at = new Date(serverNow + opts.inMs).toISOString();
  const status = opts.status ?? 'active';
  server.use(
    http.get(`${API}/promotions/banner`, () =>
      HttpResponse.json({
        data: {
          sale: {
            id: opts.id ?? 's1',
            name: 'Weekend Woof',
            status,
            startsAt: status === 'active' ? new Date(serverNow - HOUR).toISOString() : at,
            endsAt: status === 'active' ? at : new Date(serverNow + 99 * HOUR).toISOString(),
          },
          serverNow: new Date(serverNow).toISOString(),
        },
      }),
    ),
  );
}

describe('formatCountdown', () => {
  it('rounds down and shows the finest useful unit', () => {
    expect(formatCountdown(2 * HOUR + 13 * MIN + 59_000)).toBe('2h 13m');
    expect(formatCountdown(26 * HOUR + 5 * MIN)).toBe('1d 2h');
    expect(formatCountdown(5 * MIN + 7_000)).toBe('5m 07s');
    expect(formatCountdown(42_900)).toBe('42s');
    expect(formatCountdown(-5)).toBe('0s');
  });
});

describe('sale banner', () => {
  it('counts down to the SERVER end even when the device clock is 3 hours off', async () => {
    serveBanner({ inMs: 2 * HOUR + 13 * MIN + 30_000, skewMs: 3 * HOUR });
    renderWithProviders(<SaleBanner />);
    const banner = await screen.findByTestId('sale-banner');
    expect(banner).toHaveTextContent('Weekend Woof ends in 2h 13m');
  });

  it('says "starts in" for a scheduled sale, with a device clock behind the server', async () => {
    serveBanner({ status: 'scheduled', inMs: 5 * HOUR + 10 * MIN + 30_000, skewMs: -2 * HOUR });
    renderWithProviders(<SaleBanner />);
    expect(await screen.findByTestId('sale-banner')).toHaveTextContent(
      'Weekend Woof starts in 5h 10m',
    );
  });

  it('ticks once a second without announcing: the ticking text is aria-live off, nothing live around it', async () => {
    serveBanner({ inMs: 90_000 });
    renderWithProviders(<SaleBanner />);
    const countdown = await screen.findByTestId('sale-banner-countdown');
    expect(countdown).toHaveAttribute('aria-live', 'off');
    const banner = screen.getByTestId('sale-banner');
    expect(banner.closest('[aria-live]:not([aria-live="off"])')).toBeNull();
    expect(banner.querySelector('[role="status"],[role="alert"]')).toBeNull();
    // The sale name is static text, outside the ticking element.
    expect(countdown).not.toHaveTextContent('Weekend Woof');
    const first = countdown.textContent;
    await waitFor(() => expect(countdown.textContent).not.toBe(first), { timeout: 4000 });
  });

  it('hides itself when the sale ends and asks the server again', async () => {
    let calls = 0;
    const serverNow = Date.now();
    server.use(
      http.get(`${API}/promotions/banner`, () => {
        calls += 1;
        return HttpResponse.json({
          data: {
            sale:
              calls === 1
                ? {
                    id: 's1',
                    name: 'Weekend Woof',
                    status: 'active',
                    startsAt: new Date(serverNow - HOUR).toISOString(),
                    endsAt: new Date(serverNow + 1500).toISOString(),
                  }
                : null,
            serverNow: new Date(serverNow).toISOString(),
          },
        });
      }),
    );
    renderWithProviders(<SaleBanner />);
    expect(await screen.findByTestId('sale-banner')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('sale-banner')).not.toBeInTheDocument(), {
      timeout: 5000,
    });
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
  });

  it('shows nothing when there is no sale', async () => {
    renderWithProviders(<SaleBanner />);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId('sale-banner')).not.toBeInTheDocument();
  });

  it('is dismissed per sale id, and stays dismissed after a reload', async () => {
    serveBanner({ id: 's1', inMs: HOUR });
    const first = renderWithProviders(<SaleBanner />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Dismiss the Weekend Woof banner/ }),
    );
    expect(screen.queryByTestId('sale-banner')).not.toBeInTheDocument();
    expect(readDismissed()).toEqual(['s1']);
    first.unmount();

    // Same sale after a "reload": still hidden.
    renderWithProviders(<SaleBanner />);
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByTestId('sale-banner')).not.toBeInTheDocument();
  });

  it('shows a different sale even though another one was dismissed', async () => {
    window.localStorage.setItem('pawsome:sale-banner-dismissed', JSON.stringify(['s1']));
    serveBanner({ id: 's2', inMs: HOUR });
    renderWithProviders(<SaleBanner />);
    expect(await screen.findByTestId('sale-banner')).toBeInTheDocument();
  });

  it('still works, and still dismisses for the visit, when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    serveBanner({ inMs: HOUR });
    renderWithProviders(<SaleBanner />);
    expect(await screen.findByTestId('sale-banner')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('sale-banner-dismiss'));
    expect(screen.queryByTestId('sale-banner')).not.toBeInTheDocument();
  });
});
