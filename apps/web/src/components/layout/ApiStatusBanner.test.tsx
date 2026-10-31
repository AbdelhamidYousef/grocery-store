import { QueryClient } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TestProviders } from '../../test/render';
import { API, server } from '../../test/server';

import { ApiStatusBanner, DOWN_POLL_MS } from './ApiStatusBanner';

const down = () =>
  http.get(`${API}/health`, () => HttpResponse.json({ status: 'down' }, { status: 503 }));
const up = () =>
  http.get(`${API}/health`, () => HttpResponse.json({ status: 'ok', db: 'ok', version: 't' }));

afterEach(() => {
  vi.useRealTimers();
});

describe('<ApiStatusBanner />', () => {
  it('shows nothing while the server is healthy', async () => {
    let asked = false;
    server.use(
      http.get(`${API}/health`, () => {
        asked = true;
        return HttpResponse.json({ status: 'ok', db: 'ok', version: 't' });
      }),
    );
    render(<ApiStatusBanner />, { wrapper: TestProviders });
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByTestId('api-down-banner')).not.toBeInTheDocument();
  });

  it('appears when the health check fails, then goes away by itself once it passes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(down());
    render(<ApiStatusBanner />, { wrapper: TestProviders });

    const banner = await screen.findByTestId('api-down-banner');
    expect(banner).toHaveTextContent('cannot reach the shop');
    expect(banner).toHaveAttribute('role', 'status');

    server.use(up());
    await act(() => vi.advanceTimersByTimeAsync(DOWN_POLL_MS + 500));
    await waitFor(() => expect(screen.queryByTestId('api-down-banner')).not.toBeInTheDocument());
  });

  it('shows the banner when the connection itself fails', async () => {
    server.use(http.get(`${API}/health`, () => HttpResponse.error()));
    render(<ApiStatusBanner />, { wrapper: TestProviders });
    expect(await screen.findByTestId('api-down-banner')).toBeVisible();
  });

  it('re-runs the queries that failed while the server was down', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let answers = 0;
    // A page query that failed while the server was down.
    await client
      .fetchQuery({
        queryKey: ['categories'],
        queryFn: () => {
          answers += 1;
          return answers === 1 ? Promise.reject(new Error('down')) : Promise.resolve('fine');
        },
      })
      .catch(() => undefined);
    server.use(down());
    render(<ApiStatusBanner />, {
      wrapper: ({ children }) => <TestProviders client={client}>{children}</TestProviders>,
    });
    await screen.findByTestId('api-down-banner');

    server.use(up());
    await act(() => vi.advanceTimersByTimeAsync(DOWN_POLL_MS + 500));
    await waitFor(() => expect(client.getQueryData(['categories'])).toBe('fine'));
  });
});
