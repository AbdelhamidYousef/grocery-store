import {
  HelpfulResponseSchema,
  IdParamsSchema,
  ReviewCreatedResponseSchema,
  ReviewListQuerySchema,
  ReviewListResponseSchema,
  reviewInputSchema,
  SlugParamsSchema,
} from '@store/shared';
import { Router as ExpressRouter, type RequestHandler, type Router } from 'express';

import { parseReviewUpload, type UploadConfig } from '../../lib/uploads.ts';
import { respond, valid, validate } from '../../lib/validate.ts';
import { requireUser } from '../../middleware/auth.ts';
import { createUserRateLimiter, type RateLimitOptions } from '../../middleware/rate-limit.ts';
import { resolveSlug } from '../i18n/translations.ts';

import * as service from './service.ts';

export const DEFAULT_REVIEW_LIMIT: RateLimitOptions = { windowMs: 60 * 60_000, limit: 5 };
export const DEFAULT_VOTE_LIMIT: RateLimitOptions = { windowMs: 60 * 60_000, limit: 30 };

const userId = (req: { user: { id: string } | null }): string => {
  if (!req.user) throw new Error('requireUser let an anonymous request through');
  return req.user.id;
};

// Mounted after `attachUser` (who is asking decides `votedHelpful`), so nothing here is cached.
export function createReviewsRouter(opts: {
  reviewRateLimit?: RateLimitOptions;
  voteRateLimit?: RateLimitOptions;
  uploads: UploadConfig;
}): Router {
  const router = ExpressRouter();
  const reviewLimit: RequestHandler = createUserRateLimiter(
    opts.reviewRateLimit ?? DEFAULT_REVIEW_LIMIT,
  );

  const list = { params: SlugParamsSchema, query: ReviewListQuerySchema };
  router.get('/products/:slug/reviews', validate(list), async (req, res) => {
    const { params, query } = valid(req, list);
    respond(
      res,
      ReviewListResponseSchema,
      await service.listReviews(
        await resolveSlug('product', params.slug),
        query,
        req.user?.id ?? null,
        opts.uploads.enabled,
      ),
    );
  });

  const create = { params: SlugParamsSchema, body: reviewInputSchema };
  router.post(
    '/products/:slug/reviews',
    requireUser,
    reviewLimit,
    // Accepts multipart (with photos) or plain JSON (without); see lib/uploads.ts.
    parseReviewUpload,
    validate(create),
    async (req, res) => {
      const { params, body } = valid(req, create);
      res.status(201);
      respond(res, ReviewCreatedResponseSchema, {
        data: await service.createReview(
          userId(req),
          await resolveSlug('product', params.slug),
          body,
          {
            files: ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => f.buffer),
            config: opts.uploads,
          },
        ),
      });
    },
  );

  const vote = { params: IdParamsSchema };
  router.post(
    '/reviews/:id/helpful',
    requireUser,
    createUserRateLimiter(opts.voteRateLimit ?? DEFAULT_VOTE_LIMIT),
    validate(vote),
    async (req, res) => {
      const { params } = valid(req, vote);
      respond(res, HelpfulResponseSchema, {
        data: await service.toggleHelpful(userId(req), params.id),
      });
    },
  );

  return router;
}
