import type { RequestHandler } from 'express';

// Shared caches (browser, CDN, Vercel's edge) may keep a catalog response for 60 s without asking,
// and for 5 more minutes may serve it stale while fetching a fresh copy in the background. The
// price is that an admin edit can take up to 60 s to be visible to the public.
export const PUBLIC_CATALOG_CACHE = 'public, max-age=60, stale-while-revalidate=300';

export const publicCache: RequestHandler = (req, res, next) => {
  // Only reads are cacheable; the header is dropped again by the error handler if the request
  // ends up failing, so a 404 or 400 is never cached as if it were data.
  if (req.method === 'GET') res.setHeader('Cache-Control', PUBLIC_CATALOG_CACHE);
  next();
};

// Personal data (account, cart, session) must never sit in a shared cache or the back/forward cache
// of a browser on a shared computer.
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
