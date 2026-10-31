import {
  GuideCategoriesResponseSchema,
  GuideDetailResponseSchema,
  GuideListQuerySchema,
  GuideListResponseSchema,
  SlugParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as service from './service.ts';

export const guidesRouter: Router = ExpressRouter();

// Public and identical for everyone, so cacheable like the catalog (scoped by path, see there).
guidesRouter.use(['/guides', '/guide-categories'], publicCache);

guidesRouter.get('/guide-categories', async (_req, res) => {
  respond(res, GuideCategoriesResponseSchema, { data: await service.listCategories() });
});

const list = { query: GuideListQuerySchema };
guidesRouter.get('/guides', validate(list), async (req, res) => {
  const { query } = valid(req, list);
  respond(res, GuideListResponseSchema, await service.listGuides(query));
});

const bySlug = { params: SlugParamsSchema };
guidesRouter.get('/guides/:slug', validate(bySlug), async (req, res) => {
  const { params } = valid(req, bySlug);
  respond(res, GuideDetailResponseSchema, { data: await service.getGuide(params.slug) });
});
