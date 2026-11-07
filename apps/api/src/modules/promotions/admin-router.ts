import {
  AdminBulkTierInputSchema,
  AdminBulkTierListResponseSchema,
  AdminBulkTierResponseSchema,
  AdminDiscountCodeDeleteResponseSchema,
  AdminDiscountCodeInputSchema,
  AdminDiscountCodeListResponseSchema,
  AdminDiscountCodeResponseSchema,
  AdminGiftRuleInputSchema,
  AdminGiftRuleResponseSchema,
  IdParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';

import * as service from './admin-service.ts';

// Mounted under /admin behind requireAdmin and the audit log (see admin/router.ts). PUT replaces
// the whole rule because the forms submit whole rules.
export function createPromotionsAdminRouter(): Router {
  const router = ExpressRouter();
  const byId = { params: IdParamsSchema };

  // ----- discount codes -----
  router.get('/discount-codes', async (_req, res) => {
    respond(res, AdminDiscountCodeListResponseSchema, { data: await service.listCodes() });
  });
  const codeBody = { body: AdminDiscountCodeInputSchema };
  router.post('/discount-codes', validate(codeBody), async (req, res) => {
    const { body } = valid(req, codeBody);
    const code = await service.createCode(body);
    setAudit(res, 'discount_code.create', code.id);
    res.status(201);
    respond(res, AdminDiscountCodeResponseSchema, { data: code });
  });
  const codeUpdate = { params: IdParamsSchema, body: AdminDiscountCodeInputSchema };
  router.put('/discount-codes/:id', validate(codeUpdate), async (req, res) => {
    const { params, body } = valid(req, codeUpdate);
    setAudit(res, 'discount_code.update', params.id);
    respond(res, AdminDiscountCodeResponseSchema, {
      data: await service.updateCode(params.id, body),
    });
  });
  router.delete('/discount-codes/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    const outcome = await service.deleteCode(params.id);
    setAudit(res, `discount_code.${outcome === 'deleted' ? 'delete' : 'archive'}`, params.id);
    respond(res, AdminDiscountCodeDeleteResponseSchema, { data: { outcome } });
  });

  // ----- bulk tiers -----
  router.get('/bulk-tiers', async (_req, res) => {
    respond(res, AdminBulkTierListResponseSchema, { data: await service.listTiers() });
  });
  const tierBody = { body: AdminBulkTierInputSchema };
  router.post('/bulk-tiers', validate(tierBody), async (req, res) => {
    const { body } = valid(req, tierBody);
    const tier = await service.createTier(body);
    setAudit(res, 'bulk_tier.create', tier.id);
    res.status(201);
    respond(res, AdminBulkTierResponseSchema, { data: tier });
  });
  const tierUpdate = { params: IdParamsSchema, body: AdminBulkTierInputSchema };
  router.put('/bulk-tiers/:id', validate(tierUpdate), async (req, res) => {
    const { params, body } = valid(req, tierUpdate);
    setAudit(res, 'bulk_tier.update', params.id);
    respond(res, AdminBulkTierResponseSchema, { data: await service.updateTier(params.id, body) });
  });
  router.delete('/bulk-tiers/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'bulk_tier.delete', params.id);
    await service.deleteTier(params.id);
    res.status(204).end();
  });

  // ----- gift rule -----
  router.get('/gift-rule', async (_req, res) => {
    respond(res, AdminGiftRuleResponseSchema, { data: await service.getGiftRule() });
  });
  const giftBody = { body: AdminGiftRuleInputSchema };
  router.put('/gift-rule', validate(giftBody), async (req, res) => {
    const { body } = valid(req, giftBody);
    const rule = await service.setGiftRule(body);
    setAudit(res, 'gift_rule.set', rule.id);
    respond(res, AdminGiftRuleResponseSchema, { data: rule });
  });
  router.delete('/gift-rule', async (_req, res) => {
    setAudit(res, 'gift_rule.clear');
    await service.clearGiftRule();
    res.status(204).end();
  });

  return router;
}
