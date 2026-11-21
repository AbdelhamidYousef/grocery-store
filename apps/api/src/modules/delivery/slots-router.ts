import { SlotsResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond } from '../../lib/validate.ts';
import { noStore } from '../../middleware/cache.ts';

import { listSlots } from './slot-list.ts';

// Not under the cached `/delivery` router: the places left change with every booking and the answer
// depends on the postcode header, so it is never stored by a cache.
export const slotsRouter: Router = ExpressRouter();

slotsRouter.get('/delivery/slots', noStore, async (_req, res) => {
  res.vary('X-Postcode');
  respond(res, SlotsResponseSchema, { data: await listSlots() });
});
