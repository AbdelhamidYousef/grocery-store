import type { RequestHandler } from 'express';

// Shared caches (browser, CDN, Vercel's edge) may keep a catalog response for 60 s without asking,
// and for 5 more minutes may serve it stale while fetching a fresh copy in the background. The
// price is that an admin edit can take up to 60 s to be visible to the public.
export const PUBLIC_CATALOG_CACHE = 'public, max-age=60, stale-while-revalidate=300';

export const PRIVATE_CATALOG_CACHE = 'private, no-store';

export const publicCache: RequestHandler = (req, res, next) => {
  // Only reads are cacheable; the header is dropped again by the error handler if the request
  // ends up failing, so a 404 or 400 is never cached as if it were data.
  if (req.method === 'GET') res.setHeader('Cache-Control', PUBLIC_CATALOG_CACHE);
  next();
};

// Catalog responses that depend on who is asking (member prices). `Vary: Cookie` on all of them
// tells every cache the answer depends on the session cookie; a signed-in response is also marked
// private + no-store so no shared cache (or a shared computer's browser) keeps a member's prices.
// Needs `attachUser` to have run first. Guests keep the public cache.
export const catalogCache: RequestHandler = (req, res, next) => {
  res.vary('Cookie');
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', req.user ? PRIVATE_CATALOG_CACHE : PUBLIC_CATALOG_CACHE);
  }
  next();
};

// Personal data (account, cart, session) must never sit in a shared cache or the back/forward cache
// of a browser on a shared computer.
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
