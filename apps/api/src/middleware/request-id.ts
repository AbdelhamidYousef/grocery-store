import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

// Incoming ids are accepted only if they look like an id: the value ends up in logs and in a
// response header, so an unbounded or multi-line string would be a log-injection vector.
const SAFE_ID = /^[\w.:-]{1,128}$/;

export const REQUEST_ID_HEADER = 'x-request-id';

// Reusing the caller's id (web, a load balancer, a retrying client) lets one id follow a request
// across every hop; generating one when absent guarantees every log line has something to join on.
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};
