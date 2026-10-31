import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

export interface AppDeps {
  logger: Logger;
}

// The app is built by a function, not at import time, so tests can create as many isolated
// instances as they like and Supertest can drive one without opening a real port.
export function createApp({ logger }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
