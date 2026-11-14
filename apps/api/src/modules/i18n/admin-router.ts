import {
  EntityTranslationsResponseSchema,
  MissingQuerySchema,
  MissingReportResponseSchema,
  TranslationInputSchema,
  TranslationLocaleParamsSchema,
  TranslationParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';

import * as service from './admin-service.ts';

// Behind `requireAdmin` (mounted by the admin router). Admin screens always read English: these
// routes ignore the store view header.
export function createTranslationsAdminRouter(): Router {
  const router = ExpressRouter();

  // Registered first: "missing" is a literal segment and must never be read as an entity.
  const missing = { query: MissingQuerySchema };
  router.get('/translations/missing', validate(missing), async (req, res) => {
    const { query } = valid(req, missing);
    respond(res, MissingReportResponseSchema, { data: await service.missingReport(query.locale) });
  });

  const one = { params: TranslationParamsSchema };
  router.get('/translations/:entity/:id', validate(one), async (req, res) => {
    const { params } = valid(req, one);
    respond(res, EntityTranslationsResponseSchema, {
      data: await service.getEntityTranslations(params.entity, params.id),
    });
  });

  const put = { params: TranslationLocaleParamsSchema, body: TranslationInputSchema };
  router.put('/translations/:entity/:id/:locale', validate(put), async (req, res) => {
    const { params, body } = valid(req, put);
    setAudit(res, `translation.${params.entity}.update`, `${params.id}:${params.locale}`);
    respond(res, EntityTranslationsResponseSchema, {
      data: await service.putTranslation(params.entity, params.id, params.locale, body),
    });
  });

  return router;
}
