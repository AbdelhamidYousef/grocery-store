import {
  AdminBrandInputSchema,
  AdminBrandUpdateSchema,
  AdminCollectionInputSchema,
  AdminCollectionListResponseSchema,
  AdminCollectionProductsSchema,
  AdminCollectionResponseSchema,
  AdminCollectionUpdateSchema,
  AdminProductTagsSchema,
  AdminTagInputSchema,
  AdminTagUpdateSchema,
  BrandListResponseSchema,
  BrandResponseSchema,
  DataSchema,
  IdParamsSchema,
  TagListResponseSchema,
  TagSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';
import { z } from 'zod';

import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';

import * as service from './service.ts';

const TagResponseSchema = DataSchema(TagSchema);
const ProductTagsResponseSchema = DataSchema(
  z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
);

// Mounted under /admin behind requireAdmin and the audit log (see admin/router.ts).
export function createMerchandisingAdminRouter(): Router {
  const router = ExpressRouter();
  const byId = { params: IdParamsSchema };

  // ----- brands -----
  router.get('/brands', async (_req, res) => {
    respond(res, BrandListResponseSchema, { data: await service.adminListBrands() });
  });
  const createBrand = { body: AdminBrandInputSchema };
  router.post('/brands', validate(createBrand), async (req, res) => {
    const { body } = valid(req, createBrand);
    const brand = await service.createBrand(body);
    setAudit(res, 'brand.create', brand.id);
    res.status(201);
    respond(res, BrandResponseSchema, { data: brand });
  });
  router.get('/brands/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, BrandResponseSchema, { data: await service.adminGetBrand(params.id) });
  });
  const updateBrand = { params: IdParamsSchema, body: AdminBrandUpdateSchema };
  router.patch('/brands/:id', validate(updateBrand), async (req, res) => {
    const { params, body } = valid(req, updateBrand);
    setAudit(res, 'brand.update', params.id);
    respond(res, BrandResponseSchema, { data: await service.updateBrand(params.id, body) });
  });
  router.delete('/brands/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'brand.delete', params.id);
    await service.deleteBrand(params.id);
    res.status(204).end();
  });

  // ----- collections -----
  router.get('/collections', async (_req, res) => {
    respond(res, AdminCollectionListResponseSchema, {
      data: await service.adminListCollections(),
    });
  });
  const createCollection = { body: AdminCollectionInputSchema };
  router.post('/collections', validate(createCollection), async (req, res) => {
    const { body } = valid(req, createCollection);
    const collection = await service.createCollection(body);
    setAudit(res, 'collection.create', collection.id);
    res.status(201);
    respond(res, AdminCollectionResponseSchema, { data: collection });
  });
  router.get('/collections/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, AdminCollectionResponseSchema, {
      data: await service.adminGetCollection(params.id),
    });
  });
  const updateCollection = { params: IdParamsSchema, body: AdminCollectionUpdateSchema };
  router.patch('/collections/:id', validate(updateCollection), async (req, res) => {
    const { params, body } = valid(req, updateCollection);
    setAudit(res, 'collection.update', params.id);
    respond(res, AdminCollectionResponseSchema, {
      data: await service.updateCollection(params.id, body),
    });
  });
  router.delete('/collections/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'collection.delete', params.id);
    await service.deleteCollection(params.id);
    res.status(204).end();
  });
  const setProducts = { params: IdParamsSchema, body: AdminCollectionProductsSchema };
  router.put('/collections/:id/products', validate(setProducts), async (req, res) => {
    const { params, body } = valid(req, setProducts);
    setAudit(res, 'collection.set-products', params.id);
    respond(res, AdminCollectionResponseSchema, {
      data: await service.setCollectionProducts(params.id, body.productIds),
    });
  });

  // ----- tags -----
  router.get('/tags', async (_req, res) => {
    respond(res, TagListResponseSchema, { data: await service.adminListTags() });
  });
  const createTag = { body: AdminTagInputSchema };
  router.post('/tags', validate(createTag), async (req, res) => {
    const { body } = valid(req, createTag);
    const tag = await service.createTag(body);
    setAudit(res, 'tag.create', tag.id);
    res.status(201);
    respond(res, TagResponseSchema, { data: tag });
  });
  const renameTag = { params: IdParamsSchema, body: AdminTagUpdateSchema };
  router.patch('/tags/:id', validate(renameTag), async (req, res) => {
    const { params, body } = valid(req, renameTag);
    setAudit(res, 'tag.update', params.id);
    respond(res, TagResponseSchema, { data: await service.renameTag(params.id, body.name) });
  });
  router.delete('/tags/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'tag.delete', params.id);
    await service.deleteTag(params.id);
    res.status(204).end();
  });
  const setTags = { params: IdParamsSchema, body: AdminProductTagsSchema };
  router.put('/products/:id/tags', validate(setTags), async (req, res) => {
    const { params, body } = valid(req, setTags);
    setAudit(res, 'product.set-tags', params.id);
    respond(res, ProductTagsResponseSchema, {
      data: await service.setProductTags(params.id, body.tagIds),
    });
  });

  return router;
}
