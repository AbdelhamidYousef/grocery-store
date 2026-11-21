import {
  DeliveryAreasResponseSchema,
  PostcodeLookupResponseSchema,
  PostcodeParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as service from './service.ts';

// Public and identical for everyone: no cookie, cacheable for a minute like the catalogue.
export const deliveryRouter: Router = ExpressRouter();
deliveryRouter.use('/delivery', publicCache);

// A malformed code is a 400 (the validator); a well-formed one we do not serve is a normal answer.
deliveryRouter.get(
  '/delivery/postcodes/:code',
  validate({ params: PostcodeParamsSchema }),
  async (req, res) => {
    const { params } = valid(req, { params: PostcodeParamsSchema });
    respond(res, PostcodeLookupResponseSchema, { data: await service.lookup(params.code) });
  },
);

deliveryRouter.get('/delivery/areas', async (_req, res) => {
  respond(res, DeliveryAreasResponseSchema, { data: await service.listAreas() });
});
