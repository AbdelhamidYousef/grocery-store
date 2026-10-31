import { ShippingMethodsQuerySchema, ShippingMethodsResponseSchema } from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { cartIdOf, withCart } from '../../middleware/cart.ts';

import * as service from './service.ts';

export const checkoutRouter: Router = ExpressRouter();

// Checkout always works on the caller's own cart (never one named by the client), exactly like
// the cart routes.
checkoutRouter.use('/checkout', withCart);

const quotes = { query: ShippingMethodsQuerySchema };
checkoutRouter.get('/checkout/shipping-methods', validate(quotes), async (req, res) => {
  const { query } = valid(req, quotes);
  respond(res, ShippingMethodsResponseSchema, {
    data: await service.getShippingQuotes(cartIdOf(req), query.country),
  });
});
