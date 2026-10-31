import {
  CheckoutRequestSchema,
  CheckoutResponseSchema,
  ShippingMethodsQuerySchema,
  ShippingMethodsResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { setLastOrderCookie } from '../../lib/cookies.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { cartIdOf, withCart } from '../../middleware/cart.ts';

import * as service from './service.ts';

export function createCheckoutRouter(deps: { payments: PaymentGateway }): Router {
  const router = ExpressRouter();

  // Checkout always works on the caller's own cart (never one named by the client), exactly like
  // the cart routes.
  router.use('/checkout', withCart);

  const quotes = { query: ShippingMethodsQuerySchema };
  router.get('/checkout/shipping-methods', validate(quotes), async (req, res) => {
    const { query } = valid(req, quotes);
    respond(res, ShippingMethodsResponseSchema, {
      data: await service.getShippingQuotes(cartIdOf(req), query.country),
    });
  });

  // 200, not 201: calling it again for the same cart updates the pending order instead of
  // creating one, so "created" would be wrong half the time.
  const place = { body: CheckoutRequestSchema };
  router.post('/checkout', validate(place), async (req, res) => {
    const { body } = valid(req, place);
    const placed = await service.placeOrder(deps.payments, req.log, cartIdOf(req), body, req.user);
    // A guest has no account to look the order up from; this cookie is their access to it.
    setLastOrderCookie(res, placed.orderNumber);
    respond(res, CheckoutResponseSchema, { data: placed });
  });

  return router;
}
