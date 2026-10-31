import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { requestId } from './middleware/request-id.ts';

export interface AppDeps {
  logger: Logger;
}

// The app is built by a function, not at import time, so tests can create as many isolated
// instances as they like and Supertest can drive one without opening a real port.
export function createApp({ logger }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  // First, so every later middleware (and the access log) can rely on req.id.
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      // Reuse the id set above instead of letting pino-http mint a second, different one.
      genReqId: (req) => req.id,
    }),
  );
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
