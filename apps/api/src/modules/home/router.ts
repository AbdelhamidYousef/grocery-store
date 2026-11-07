import { HomeResponseSchema, TestimonialsResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import * as service from './service.ts';

export const homeRouter: Router = ExpressRouter();

// Public, the same for everyone: cacheable for 60 s like the catalog (scoped by path).
homeRouter.use(['/home', '/testimonials'], publicCache);

homeRouter.get('/home', async (_req, res) => {
  respond(res, HomeResponseSchema, { data: await service.getHome() });
});

homeRouter.get('/testimonials', async (_req, res) => {
  respond(res, TestimonialsResponseSchema, await service.getTestimonials());
});
