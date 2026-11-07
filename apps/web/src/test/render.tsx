import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ActivePetProvider } from '../features/pets/ActivePetProvider';
import { routes } from '../routes';

// The same provider stack as main.tsx. A fresh QueryClient per render so no test sees another's
// cache; retries off so an error test does not wait through backoff.
export function TestProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ActivePetProvider>{children}</ActivePetProvider>
        </AuthProvider>
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
  const router = createMemoryRouter(table, { initialEntries: [path] });
  renderWithProviders(<RouterProvider router={router} />);
  return router;
}
