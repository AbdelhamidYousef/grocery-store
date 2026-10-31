import {
  CategoryResponseSchema,
  CategoryTreeResponseSchema,
  ProductDetailResponseSchema,
  ProductListQuerySchema,
  ProductListResponseSchema,
  SlugParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as service from './service.ts';

export const catalogRouter: Router = ExpressRouter();

// Scoped by path: this router is mounted at the API root, so an unscoped `use` would stamp the
// public cache header on every other module's responses (cart, account) as well.
catalogRouter.use(['/categories', '/products'], publicCache);

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

catalogRouter.get('/products/:slug', validate(bySlug), async (req, res) => {
  const { params } = valid(req, bySlug);
  respond(res, ProductDetailResponseSchema, { data: await service.getProduct(params.slug) });
});
