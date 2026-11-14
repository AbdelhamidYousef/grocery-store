import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { AppLayout } from './components/layout/AppLayout';
import { RequireAdmin, RequireAuth } from './features/auth/guards';
import { LegalPage } from './features/legal/LegalPage';
import { LEGAL_PAGES } from './features/legal/pages';
import { StoreLayout } from './features/stores/StoreContext';
import { readStoreCookie } from './lib/store-cookie';
import { pickStore, resolveEntry } from './lib/store-entry';
import BrandPage from './pages/BrandPage';
import BrandsPage from './pages/BrandsPage';
import CartPage from './pages/CartPage';
import CategoryPage from './pages/CategoryPage';
import CharityPage from './pages/CharityPage';
import CollectionPage from './pages/CollectionPage';
import ContactPage from './pages/ContactPage';
import DevelopersPage from './pages/DevelopersPage';
import GuidePage from './pages/GuidePage';
import GuidesPage from './pages/GuidesPage';
import HelpPage from './pages/HelpPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import {
  NewsletterConfirmPage,
  NewsletterPage,
  NewsletterUnsubscribePage,
  StockAlertCancelPage,
} from './pages/NewsletterPage';
import NotFoundPage from './pages/NotFoundPage';
import PetsPage from './pages/PetsPage';
import ProductPage from './pages/ProductPage';
import RegisterPage from './pages/RegisterPage';
import RouteErrorPage from './pages/RouteErrorPage';
import RouteFallback from './pages/RouteFallback';
import SearchPage from './pages/SearchPage';
import SharedWishlistPage from './pages/SharedWishlistPage';
import TrackOrderPage from './pages/TrackOrderPage';
import WishlistPage from './pages/WishlistPage';
import WithdrawPage from './pages/WithdrawPage';

// Every route lives here, in one file (the plan's SSR guard-rail: a prerender step can read this
// same table later). Shoppers hit the storefront routes first, so those are in the main bundle.
// Checkout, account and admin are rarely the first page and are heavier, so each is its own chunk
// via `lazy`, fetched only when the route is visited.
//
// Data router (createBrowserRouter) rather than <Routes>: it gives route-level `lazy`,
// `errorElement` and (later) loaders, none of which exist in the component-style API.
//
// Store views (phase 21): the table below has no store segment. The router is created with a
// `basename` of `/<store code>` (see `lib/store-entry.ts`), and `StoreLayout` reads it back to
// provide the store to the tree, so a link or redirect anywhere in the app is prefixed for free.
export const routes: RouteObject[] = [
  {
    element: <StoreLayout />,
    children: [
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
              { path: 'brands', element: <BrandsPage /> },
              { path: 'brands/:slug', element: <BrandPage /> },
              { path: 'collections/:slug', element: <CollectionPage /> },
              { path: 'search', element: <SearchPage /> },
              { path: 'charity', element: <CharityPage /> },
              { path: 'developers', element: <DevelopersPage /> },
              { path: 'wishlist', element: <WishlistPage /> },
              { path: 'w/:token', element: <SharedWishlistPage /> },
              { path: 'newsletter', element: <NewsletterPage /> },
              { path: 'newsletter/confirm', element: <NewsletterConfirmPage /> },
              { path: 'newsletter/unsubscribe', element: <NewsletterUnsubscribePage /> },
              { path: 'stock-alerts/cancel', element: <StockAlertCancelPage /> },
              { path: 'contact', element: <ContactPage /> },
              { path: 'withdraw', element: <WithdrawPage /> },
              // Static pages: one component, one route per Markdown file.
              ...LEGAL_PAGES.map((page) => ({
                path: page.path,
                element: <LegalPage page={page} />,
              })),
              { path: 'track-order', element: <TrackOrderPage /> },
              { path: 'help', element: <HelpPage /> },
              { path: 'guides', element: <GuidesPage /> },
              { path: 'guides/:slug', element: <GuidePage /> },
              { path: 'cart', element: <CartPage /> },
              { path: 'login', element: <LoginPage /> },
              { path: 'register', element: <RegisterPage /> },
              {
                path: 'checkout',
                lazy: async () => ({ Component: (await import('./pages/CheckoutPage')).default }),
              },
              {
                path: 'checkout/confirmation/:number',
                lazy: async () => ({
                  Component: (await import('./pages/ConfirmationPage')).default,
                }),
              },
              // Public on purpose: a guest keeps their pets in the browser (listed before the guarded
              // `account/*` splat, and a static path outranks a splat).
              { path: 'account/pets', element: <PetsPage /> },
              // Guards are pathless layout routes: they render the matched child via <Outlet />.
              {
                element: <RequireAuth />,
                children: [
                  {
                    path: 'account/*',
                    lazy: async () => ({
                      Component: (await import('./pages/AccountPage')).default,
                    }),
                  },
                ],
              },
              {
                element: <RequireAdmin />,
                children: [
                  {
                    path: 'admin/*',
                    lazy: async () => ({ Component: (await import('./pages/AdminPage')).default }),
                  },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

// Called from main.tsx, not at import time: creating the browser router reads `window`.
// An old unprefixed URL (or a bare `/`) is rewritten to the remembered store first, with
// `replaceState`, so the back button does not bounce through the old address.
export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  const entry = resolveEntry(window.location, () =>
    pickStore(readStoreCookie(), navigator.languages),
  );
  if (entry.replaceWith) window.history.replaceState(window.history.state, '', entry.replaceWith);
  return createBrowserRouter(routes, { basename: entry.basename || '/' });
}
