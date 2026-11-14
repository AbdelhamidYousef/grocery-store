import { timingSafeEqual } from 'node:crypto';

import { Router as ExpressRouter, type RequestHandler, type Router } from 'express';
import { z } from 'zod';

import { jobs, runDueJobs, runJob } from '../../jobs/runner.ts';
import { AppError, notFound, unauthenticated } from '../../lib/errors.ts';
import type { PaymentGateway } from '../../lib/stripe.ts';
import { valid, validate } from '../../lib/validate.ts';
import type { Outbox } from '../mail/outbox.ts';

const BodySchema = z.object({ name: z.string().min(1).max(80).optional() }).default({});

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// POST /internal/jobs/run: the production trigger for scheduled work. A scheduled GitHub Actions
// workflow calls it hourly with `X-Jobs-Secret` (which also wakes the sleeping Render service).
// Without a configured secret the route does not exist (404), so an unconfigured deployment
// cannot be poked by anyone. The body may name one job; otherwise every due job runs. Safe to
// call as often as you like: runs are claimed per period (jobs/runner.ts).
export function createJobsRouter(opts: {
  secret: string | undefined;
  payments: PaymentGateway;
  outbox: Outbox;
}): Router {
  const router = ExpressRouter();
  const schemas = { body: BodySchema };
  // The secret is checked BEFORE the body is validated: an unauthenticated caller must not be able
  // to probe the body schema (a 400 would say "your secret is not even looked at yet").
  const authorise: RequestHandler = (req, _res, next) => {
    if (!opts.secret) throw notFound();
    const given = req.get('x-jobs-secret') ?? '';
    if (!safeEqual(given, opts.secret)) throw unauthenticated('Invalid job secret');
    next();
  };
  router.post('/internal/jobs/run', authorise, validate(schemas), async (req, res) => {
    const { body } = valid(req, schemas);
    const ctx = { now: new Date(), log: req.log, gateway: opts.payments, outbox: opts.outbox };
    if (body.name && !jobs.some((j) => j.name === body.name)) {
      throw new AppError('NOT_FOUND', `Unknown job "${body.name}"`);
    }
    const outcomes = body.name ? [await runJob(body.name, ctx)] : await runDueJobs(ctx);
    res.json({ data: { outcomes } });
  });
  return router;
}
