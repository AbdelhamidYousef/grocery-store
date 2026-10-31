import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

// What `validate` leaves on the request: the parsed (coerced, defaulted) output of each schema
// that was given, and nothing for the ones that were not.
export type Valid<S extends Schemas> = {
  [K in keyof S & keyof Schemas as S[K] extends z.ZodType ? K : never]: S[K] extends z.ZodType
    ? z.output<S[K]>
    : never;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the only way to extend Express's Request
  namespace Express {
    interface Request {
      valid: Partial<Record<keyof Schemas, unknown>>;
    }
  }
}

// Express 5 made `req.query` and `req.params` read-only getters, so parsed values cannot replace
// them; they live on `req.valid` instead and the raw values stay available but untrusted.
export function validate<const S extends Schemas>(schemas: S): RequestHandler {
  return (req, _res, next) => {
    // A ZodError thrown here is turned into a 400 by the error middleware; parse() rather than
    // safeParse() keeps this function free of response logic.
    req.valid = {
      ...(schemas.body && { body: schemas.body.parse(req.body) }),
      ...(schemas.query && { query: schemas.query.parse(req.query) }),
      ...(schemas.params && { params: schemas.params.parse(req.params) }),
    };
    next();
  };
}

// Reads the parsed values back with their inferred types. The schemas argument is only a type
// witness: it is how TypeScript learns what `validate(...)` produced for this route, since
// Express cannot carry that through its middleware chain.
export function valid<const S extends Schemas>(req: Request, _schemas: S): Valid<S> {
  return req.valid as Valid<S>;
}

// Sends `{ data }` (plus optional `meta`). Outside production the data is first checked against
// the schema that documents the endpoint, so a response drifting from the contract fails loudly
// in development and tests instead of silently confusing the web client.
export function respond<T extends z.ZodType>(
  res: Response,
  schema: T,
  data: z.input<T>,
  meta?: Record<string, unknown>,
): void {
  if (res.app.get('env') !== 'production') {
    const result = schema.safeParse(data);
    if (!result.success) {
      // A plain Error on purpose: invalid *output* is our bug (500), not a client mistake (400).
      throw new Error(`response does not match its schema: ${z.prettifyError(result.error)}`);
    }
  }
  res.json(meta ? { data, meta } : { data });
}
