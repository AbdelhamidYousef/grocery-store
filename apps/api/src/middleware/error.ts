import { ErrorCode, errorStatus } from '@store/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

import { AppError, notFound } from '../lib/errors.ts';

// Anything routed nowhere ends here, so unknown URLs get the same JSON envelope as every other error.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.path} not found`));
};

// body-parser (and other `http-errors` users) attach a numeric status and a machine `type`.
function httpStatusOf(err: unknown): { status: number; type: string | undefined } | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, type } = err as { status?: unknown; type?: unknown };
  if (typeof status !== 'number' || status < 400 || status > 499) return undefined;
  return { status, type: typeof type === 'string' ? type : undefined };
}

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

function body(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

// The only place an error becomes an HTTP response. The 4-argument signature is what makes
// Express treat this as an error handler, so `_next` must stay even though it is unused.
export function createErrorHandler(opts: { isProduction: boolean }): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    if (res.headersSent) {
      // Too late to send a JSON body; let Express close the connection.
      req.log.error({ err }, 'error after headers were sent');
      res.end();
      return;
    }

    // Whatever an earlier middleware promised about caching no longer holds for an error body.
    res.setHeader('Cache-Control', 'no-store');

    if (err instanceof AppError) {
      req.log.info({ err: { code: err.code, message: err.message } }, 'request failed');
      res.status(err.status).json(body(err.code, err.message, err.details));
      return;
    }

    if (err instanceof z.ZodError) {
      req.log.info({ issues: err.issues.length }, 'request validation failed');
      res
        .status(errorStatus.VALIDATION_ERROR)
        .json(body(ErrorCode.VALIDATION_ERROR, 'Request validation failed', z.flattenError(err)));
      return;
    }

    const http = httpStatusOf(err);
    if (http) {
      // Malformed JSON, oversize payloads, bad encodings: the client's fault, not ours.
      req.log.info({ type: http.type }, 'request rejected by parser');
      const message =
        http.type === 'entity.parse.failed'
          ? 'Request body is not valid JSON'
          : http.type === 'entity.too.large'
            ? 'Request body is too large'
            : 'Bad request';
      res.status(http.status).json(body(ErrorCode.VALIDATION_ERROR, message));
      return;
    }

    // Unknown failure: log the stack for us, tell the client nothing useful to an attacker.
    req.log.error({ err }, 'unhandled error');
    const message =
      opts.isProduction || !(err instanceof Error) ? 'Internal server error' : err.message;
    res.status(500).json(body(ErrorCode.INTERNAL, message));
  };
}
