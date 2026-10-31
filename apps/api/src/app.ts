import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { createErrorHandler, notFoundHandler } from './middleware/error.ts';
import { requestId } from './middleware/request-id.ts';

export interface AppDeps {
  logger: Logger;
  // Required (no default) so nobody can build a production app that leaks error messages by omission.
  nodeEnv: 'development' | 'test' | 'production';
}

// The app is built by a function, not at import time, so tests can create as many isolated
// instances as they like and Supertest can drive one without opening a real port.
export function createApp({ logger, nodeEnv }: AppDeps): Express {
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

  // Order matters: unknown routes first, then the error handler that catches everything above.
  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction: nodeEnv === 'production' }));

  return app;
}
