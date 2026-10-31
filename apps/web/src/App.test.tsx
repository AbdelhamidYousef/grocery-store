import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows the api health status once the request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'ok' }) }),
    );
    // retry off so a failing request surfaces immediately instead of after backoff delays
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Store' })).toBeInTheDocument();
    expect(await screen.findByText('api: ok')).toBeInTheDocument();
  });
});
