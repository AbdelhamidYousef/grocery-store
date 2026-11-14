import { GalleryQuerySchema, GalleryResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';

import * as service from './service.ts';

// Public: published photos with their (active) products. Mounted before the session middleware
// next to the catalog, so it is cacheable and cookie-free: nothing here depends on who asks.
export const galleryRouter: Router = ExpressRouter();
galleryRouter.get('/gallery', validate({ query: GalleryQuerySchema }), async (req, res) => {
  const { query } = valid(req, { query: GalleryQuerySchema });
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  respond(res, GalleryResponseSchema, { data: await service.listPublic(query.productId) });
});
