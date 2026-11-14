import {
  StockAlertCancelParamsSchema,
  StockAlertCreateSchema,
  StockAlertResponseSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { createIpRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';

import * as service from './service.ts';

export const DEFAULT_STOCK_ALERT_LIMIT: RateLimitOptions = { windowMs: 60 * 60_000, limit: 20 };

// Mounted after `attachUser`: a signed-in asker is remembered on the alert.
export function createStockAlertsRouter(opts: { stockAlertRateLimit?: RateLimitOptions }): Router {
  const router = ExpressRouter();
  const limit = createIpRateLimiter(opts.stockAlertRateLimit ?? DEFAULT_STOCK_ALERT_LIMIT);

  const create = { body: StockAlertCreateSchema };
  router.post('/stock-alerts', limit, validate(create), async (req, res) => {
    const { body } = valid(req, create);
    await service.createAlert({ ...body, userId: req.user?.id ?? null });
    res.status(201);
    respond(res, StockAlertResponseSchema, { data: { status: 'waiting' } });
  });

  const cancel = { params: StockAlertCancelParamsSchema };
  router.delete('/stock-alerts/:token', validate(cancel), async (req, res) => {
    const { params } = valid(req, cancel);
    await service.cancelAlert(params.token);
    res.status(204).end();
  });

  return router;
}
