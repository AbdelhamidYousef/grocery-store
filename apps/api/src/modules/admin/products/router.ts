import {
  AdminInventoryResponseSchema,
  AdminInventorySetSchema,
  AdminProductCreateSchema,
  AdminProductListQuerySchema,
  AdminProductListResponseSchema,
  AdminProductResponseSchema,
  AdminProductUpdateSchema,
  AdminVariantInputSchema,
  AdminVariantParamsSchema,
  AdminVariantPricesInputSchema,
  AdminVariantPricesResponseSchema,
  AdminVariantResponseSchema,
  AdminVariantUpdateSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../../lib/validate.ts';
import { adminActor } from '../actor.ts';
import { setAudit } from '../audit.ts';

import * as service from './service.ts';

// Product, variant, image and inventory management. Images are part of the product (create and
// PATCH carry the whole list, URLs only), so there is no separate image endpoint to keep in sync.
export function createProductsRouter(): Router {
  const router = ExpressRouter();

  const list = { query: AdminProductListQuerySchema };
  router.get('/products', validate(list), async (req, res) => {
    const { query } = valid(req, list);
    respond(res, AdminProductListResponseSchema, await service.listProducts(query));
  });

  const create = { body: AdminProductCreateSchema };
  router.post('/products', validate(create), async (req, res) => {
    const { body } = valid(req, create);
    const product = await service.createProduct(body, adminActor(req));
    setAudit(res, 'product.create', product.id);
    res.status(201);
    respond(res, AdminProductResponseSchema, { data: product });
  });

  const byId = { params: IdParamsSchema };
  router.get('/products/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, AdminProductResponseSchema, { data: await service.getProduct(params.id) });
  });

  const update = { params: IdParamsSchema, body: AdminProductUpdateSchema };
  router.patch('/products/:id', validate(update), async (req, res) => {
    const { params, body } = valid(req, update);
    setAudit(res, 'product.update', params.id);
    respond(res, AdminProductResponseSchema, {
      data: await service.updateProduct(params.id, body),
    });
  });

  const addVariant = { params: IdParamsSchema, body: AdminVariantInputSchema };
  router.post('/products/:id/variants', validate(addVariant), async (req, res) => {
    const { params, body } = valid(req, addVariant);
    const variant = await service.addVariant(params.id, body, adminActor(req));
    setAudit(res, 'variant.create', variant.id);
    res.status(201);
    respond(res, AdminVariantResponseSchema, { data: variant });
  });

  const patchVariant = { params: IdParamsSchema, body: AdminVariantUpdateSchema };
  router.patch('/variants/:id', validate(patchVariant), async (req, res) => {
    const { params, body } = valid(req, patchVariant);
    setAudit(res, 'variant.update', params.id);
    respond(res, AdminVariantResponseSchema, {
      data: await service.updateVariant(params.id, body),
    });
  });

  router.get('/variants/:id/prices', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    respond(res, AdminVariantPricesResponseSchema, {
      data: await service.getVariantPrices(params.id),
    });
  });

  const setPrices = { params: IdParamsSchema, body: AdminVariantPricesInputSchema };
  router.put('/variants/:id/prices', validate(setPrices), async (req, res) => {
    const { params, body } = valid(req, setPrices);
    setAudit(res, 'variant.prices', params.id);
    respond(res, AdminVariantPricesResponseSchema, {
      data: await service.setVariantPrices(params.id, body),
    });
  });

  router.delete('/variants/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'variant.delete', params.id);
    await service.deleteVariant(params.id);
    res.status(204).end();
  });

  const setStock = { params: AdminVariantParamsSchema, body: AdminInventorySetSchema };
  router.patch('/inventory/:variantId', validate(setStock), async (req, res) => {
    const { params, body } = valid(req, setStock);
    setAudit(res, 'inventory.set', params.variantId);
    respond(res, AdminInventoryResponseSchema, {
      data: await service.setInventory(params.variantId, body, adminActor(req)),
    });
  });

  return router;
}
