import { HelpQuerySchema, HelpResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { publicCache } from '../../middleware/cache.ts';

import { searchHelp } from './service.ts';

export const helpRouter: Router = ExpressRouter();

helpRouter.use('/help', publicCache);

const search = { query: HelpQuerySchema };
helpRouter.get('/help', validate(search), async (req, res) => {
  const { query } = valid(req, search);
  respond(res, HelpResponseSchema, { data: await searchHelp(query.q, query.topic) });
});
