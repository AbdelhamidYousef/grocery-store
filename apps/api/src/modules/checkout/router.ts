import {
  CheckoutRequestSchema,
  CheckoutResponseSchema,
  OrderNumberParamsSchema,
  OrderResponseSchema,
  OrderStatusResponseSchema,
  ShippingMethodsQuerySchema,
  ShippingMethodsResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Request, type Router } from 'express';

import { readLastOrder, setLastOrderCookie } from '../../lib/cookies.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { cartIdOf, withCart } from '../../middleware/cart.ts';

import * as service from './service.ts';

export function createCheckoutRouter(deps: { payments: PaymentGateway }): Router {
  const router = ExpressRouter();

  // Quote and place-order work on the caller's own cart (never one named by the client), exactly
  // like the cart routes. `withCart` is per route, not on `/checkout`: reading an order must not
  // create an empty guest cart as a side effect.
  const quotes = { query: ShippingMethodsQuerySchema };
  router.get('/checkout/shipping-methods', withCart, validate(quotes), async (req, res) => {
    const { query } = valid(req, quotes);
    respond(res, ShippingMethodsResponseSchema, {
      data: await service.getShippingQuotes(cartIdOf(req), query.country),
    });
  });

  // 200, not 201: calling it again for the same cart updates the pending order instead of
  // creating one, so "created" would be wrong half the time.
  const place = { body: CheckoutRequestSchema };
  router.post('/checkout', withCart, validate(place), async (req, res) => {
    const { body } = valid(req, place);
    const placed = await service.placeOrder(deps.payments, req.log, cartIdOf(req), body, req.user);
    // A guest has no account to look the order up from; this cookie is their access to it.
    setLastOrderCookie(res, placed.orderNumber);
    respond(res, CheckoutResponseSchema, { data: placed });
  });

  // Reading an order: the signed-in owner, or the browser that just placed it (`last_order`).
  const viewerOf = (req: Request) => ({
    userId: req.user?.id ?? null,
    lastOrderNumber: readLastOrder(req),
  });

  // Polled every ~2 s by the confirmation page until the webhook flips the order to `paid`.
  const byNumber = { params: OrderNumberParamsSchema };
  router.get('/checkout/orders/:number/status', validate(byNumber), async (req, res) => {
    const { params } = valid(req, byNumber);
    respond(res, OrderStatusResponseSchema, {
      data: await service.getOrderStatus(params.number, viewerOf(req)),
    });
  });

  // Full order for the confirmation page, also for guests (the contract's account endpoint is
  // user-only). Same access rule as the status endpoint.
  router.get('/checkout/orders/:number', validate(byNumber), async (req, res) => {
    const { params } = valid(req, byNumber);
    respond(res, OrderResponseSchema, {
      data: await service.getOrder(params.number, viewerOf(req)),
    });
  });

  return router;
}
