import type { RequestHandler } from 'express';

// One log line per admin MUTATION: who (user id), what (an action name), which request (the same
// id that is on every other log line and in the X-Request-Id header), and how it ended (status).
// It is logged when the response finishes, so refused and failed attempts are on record too.
//
// Handlers name their action (`audit(res, 'product.create')`); an unnamed one falls back to
// "METHOD /route/pattern", which is still searchable. Reads are not audited: they change nothing
// and would drown the interesting lines.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the only way to extend Express's Locals
  namespace Express {
    interface Locals {
      auditAction?: string;
      auditTarget?: string;
    }
  }
}

export function setAudit(res: { locals: Express.Locals }, action: string, target?: string): void {
  res.locals.auditAction = action;
  if (target !== undefined) res.locals.auditTarget = target;
}

export const auditMutations: RequestHandler = (req, res, next) => {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  res.on('finish', () => {
    // Express types `req.route` as any; this is the one narrowing of it.
    const route = req.route as { path?: string } | undefined;
    req.log.info(
      {
        audit: true,
        requestId: req.id,
        userId: req.user?.id ?? null,
        action: res.locals.auditAction ?? `${req.method} ${req.baseUrl}${route?.path ?? req.path}`,
        target: res.locals.auditTarget ?? null,
        status: res.statusCode,
      },
      'admin action',
    );
  });
  next();
};
