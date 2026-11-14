import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../features/auth/AuthProvider';
import { resolveEntry } from '../lib/store-entry';
import { routes } from '../routes';

// The same provider stack as main.tsx. A fresh QueryClient per render so no test sees another's
// cache; retries off so an error test does not wait through backoff.
export function TestProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<TestProviders>{ui}</TestProviders>);
}

export function renderApp(
  path: string,
  table: RouteObject[] = routes,
): ReturnType<typeof createMemoryRouter> {
  // A plain path renders without a store prefix, so the many page tests keep asserting plain
  // hrefs; a path that starts with a store code (`/de-de/cart`) gets that basename, exactly as in
  // the browser. The legacy redirect itself is covered in `store-entry.test.ts` and the e2e.
  const entry = resolveEntry(new URL(path, 'http://test'));
  const prefixed = entry.replaceWith === null && entry.basename !== '';
  const router = createMemoryRouter(table, {
    initialEntries: [path],
    basename: prefixed ? entry.basename : '/',
  });
  renderWithProviders(<RouterProvider router={router} />);
  return router;
}
