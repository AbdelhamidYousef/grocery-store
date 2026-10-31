import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { AppLayout } from './components/layout/AppLayout';
import CartPage from './pages/CartPage';
import CategoryPage from './pages/CategoryPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import ProductPage from './pages/ProductPage';
import RegisterPage from './pages/RegisterPage';
import RouteErrorPage from './pages/RouteErrorPage';
import RouteFallback from './pages/RouteFallback';
import SearchPage from './pages/SearchPage';

// Every route lives here, in one file (the plan's SSR guard-rail: a prerender step can read this
// same table later). Shoppers hit the storefront routes first, so those are in the main bundle.
// Checkout, account and admin are rarely the first page and are heavier, so each is its own chunk
// via `lazy`, fetched only when the route is visited.
//
// Data router (createBrowserRouter) rather than <Routes>: it gives route-level `lazy`,
// `errorElement` and (later) loaders, none of which exist in the component-style API.
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    // The layout's own failure falls back to a bare error page; page-level failures are caught
    // one level down so the header and footer stay on screen.
    errorElement: <RouteErrorPage />,
    HydrateFallback: RouteFallback,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'c/:slug', element: <CategoryPage /> },
          { path: 'products/:slug', element: <ProductPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'cart', element: <CartPage /> },
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          {
            path: 'checkout',
            lazy: async () => ({ Component: (await import('./pages/CheckoutPage')).default }),
          },
          {
            path: 'checkout/confirmation/:number',
            lazy: async () => ({ Component: (await import('./pages/ConfirmationPage')).default }),
          },
          {
            path: 'account/*',
            lazy: async () => ({ Component: (await import('./pages/AccountPage')).default }),
          },
          {
            path: 'admin/*',
            lazy: async () => ({ Component: (await import('./pages/AdminPage')).default }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

// Called from main.tsx, not at import time: creating the browser router reads `window`.
export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes);
}
