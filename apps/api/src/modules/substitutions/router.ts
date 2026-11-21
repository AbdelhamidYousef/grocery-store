import { SwapAnswerResponseSchema, SwapDecisionSchema, SwapParamsSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';

import * as swaps from './swaps.ts';

// The shopper's answer to one replacement, before the bag leaves: signed in as the owner of the
// order, or with the signed token of the email link (a guest order has no account).
export function createSwapsRouter(): Router {
  const router = ExpressRouter();
  const answer = { params: SwapParamsSchema, body: SwapDecisionSchema };
  router.post('/orders/:number/swaps/:itemId', validate(answer), async (req, res) => {
    const { params, body } = valid(req, answer);
    respond(res, SwapAnswerResponseSchema, {
      data: await swaps.decideSwap(
        { userId: req.user?.id ?? null, token: body.token ?? null },
        params.number,
        params.itemId,
        body.decision,
      ),
    });
  });
  return router;
}
