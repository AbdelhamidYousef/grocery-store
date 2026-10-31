import {
  BrandListResponseSchema,
  BrandResponseSchema,
  CollectionListResponseSchema,
  CollectionResponseSchema,
  SlugParamsSchema,
  TagListResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as service from './service.ts';

// Public, cookie-free and cacheable like the rest of the catalog, so it is mounted before the
// session middleware and scoped by path (see catalog/router.ts for why).
export const merchandisingRouter: Router = ExpressRouter();
merchandisingRouter.use(['/brands', '/collections', '/tags'], publicCache);

merchandisingRouter.get('/brands', async (_req, res) => {
  respond(res, BrandListResponseSchema, { data: await service.listBrands() });
});

const bySlug = { params: SlugParamsSchema };
merchandisingRouter.get('/brands/:slug', validate(bySlug), async (req, res) => {
  const { params } = valid(req, bySlug);
  respond(res, BrandResponseSchema, { data: await service.getBrand(params.slug) });
});

merchandisingRouter.get('/collections', async (_req, res) => {
  respond(res, CollectionListResponseSchema, { data: await service.listLiveCollections() });
});

merchandisingRouter.get('/collections/:slug', validate(bySlug), async (req, res) => {
  const { params } = valid(req, bySlug);
  respond(res, CollectionResponseSchema, { data: await service.getLiveCollection(params.slug) });
});

merchandisingRouter.get('/tags', async (_req, res) => {
  respond(res, TagListResponseSchema, { data: await service.listTags() });
});
