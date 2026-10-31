import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

import { routes } from '../routes';

// A fresh QueryClient per render so no test sees another's cache; retries off so an error test
// does not wait through backoff.
export function renderApp(
  path: string,
  table: RouteObject[] = routes,
): ReturnType<typeof createMemoryRouter> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(table, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
