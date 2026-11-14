import {
  AdminReviewListResponseSchema,
  AdminReviewQuerySchema,
  AdminReviewResponseSchema,
  IdParamsSchema,
  RejectReviewBodySchema,
  type AdminReview,
} from '@store/shared';
import { Router as ExpressRouter, type Router } from 'express';

import { removePhotos, type UploadConfig } from '../../lib/uploads.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { setAudit } from '../admin/audit.ts';
import type { Outbox } from '../mail/outbox.ts';

import { approveReview, deleteReview, rejectReview } from './moderation.ts';
import * as service from './service.ts';

// Moderation queue, mounted under /admin (requireAdmin + audit log). Every action names itself for
// the audit log with the review id, so "who approved what" is searchable.
export function createReviewsAdminRouter(deps: { outbox: Outbox; uploads: UploadConfig }): Router {
  const router = ExpressRouter();

  const list = { query: AdminReviewQuerySchema };
  router.get('/reviews', validate(list), async (req, res) => {
    const { query } = valid(req, list);
    respond(res, AdminReviewListResponseSchema, await service.adminList(query));
  });

  // The response of an action is the review in its new state, so the screen can update in place.
  const reply = async (res: Parameters<typeof respond>[0], id: string) => {
    respond(res, AdminReviewResponseSchema, { data: await service.adminOne(id) });
  };

  const byId = { params: IdParamsSchema };
  router.post('/reviews/:id/approve', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'review.approve', params.id);
    await approveReview(params.id, deps.outbox);
    await reply(res, params.id);
  });

  const reject = { params: IdParamsSchema, body: RejectReviewBodySchema };
  router.post('/reviews/:id/reject', validate(reject), async (req, res) => {
    const { params, body } = valid(req, reject);
    setAudit(res, 'review.reject', params.id);
    await rejectReview(params.id, body.reason);
    await reply(res, params.id);
  });

  router.delete('/reviews/:id', validate(byId), async (req, res) => {
    const { params } = valid(req, byId);
    setAudit(res, 'review.delete', params.id);
    const paths = await deleteReview(params.id);
    await removePhotos(deps.uploads, paths);
    res.status(204).end();
  });

  return router;
}

export type { AdminReview };
