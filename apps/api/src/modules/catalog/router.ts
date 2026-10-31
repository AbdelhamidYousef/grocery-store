import {
  CategoryResponseSchema,
  CategoryTreeResponseSchema,
  ProductListQuerySchema,
  ProductListResponseSchema,
  SlugParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';

import * as service from './service.ts';

export const catalogRouter: Router = ExpressRouter();

catalogRouter.get('/categories', async (_req, res) => {
  respond(res, CategoryTreeResponseSchema, { data: await service.getCategoryTree() });
});

const bySlug = { params: SlugParamsSchema };
catalogRouter.get('/categories/:slug', validate(bySlug), async (req, res) => {
  const { params } = valid(req, bySlug);
  respond(res, CategoryResponseSchema, { data: await service.getCategory(params.slug) });
});

const listProducts = { query: ProductListQuerySchema };
catalogRouter.get('/products', validate(listProducts), async (req, res) => {
  const { query } = valid(req, listProducts);
  respond(res, ProductListResponseSchema, await service.listProducts(query));
});
