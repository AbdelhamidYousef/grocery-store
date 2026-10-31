import type { RequestHandler } from 'express';

import { forbidden } from '../lib/errors.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

// Origin-check CSRF defence. A browser always attaches `Origin` (or at least `Referer`) to a
// cross-site request and page scripts cannot forge it, so requiring it to equal our web origin
// stops a hostile page from using the visitor's cookies. SameSite=Lax already withholds the
// cookie from cross-site POSTs; this check is the second, independent layer.
// Webhooks are exempt because Stripe is a server, not a browser: it has no Origin and is
// authenticated by its signature instead.
export function createCsrfCheck(opts: {
  webOrigin: string;
  exemptPrefixes?: string[];
}): RequestHandler {
  const exempt = opts.exemptPrefixes ?? ['/api/v1/webhooks/'];
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || exempt.some((p) => req.path.startsWith(p))) {
      next();
      return;
    }
    const origin = originOf(req.get('origin')) ?? originOf(req.get('referer'));
    if (origin !== opts.webOrigin) {
      next(forbidden('Cross-origin request blocked'));
      return;
    }
    next();
  };
}
