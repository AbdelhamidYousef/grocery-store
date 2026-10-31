import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { createCsrfCheck } from './middleware/csrf.ts';
import { createErrorHandler, notFoundHandler } from './middleware/error.ts';
import { createRateLimiter, type RateLimitOptions } from './middleware/rate-limit.ts';
import { requestId } from './middleware/request-id.ts';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  webOrigin: string;
  cookieSecret: string;
  rateLimit: RateLimitOptions;
}

export interface AppDeps {
  logger: Logger;
  // Required (no defaults) so nobody can build a production app with test-grade security by omission.
  config: AppConfig;
}

// The app is built by a function, not at import time, so tests can create as many isolated
// instances as they like and Supertest can drive one without opening a real port.
export function createApp({ logger, config }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  // `respond()` reads this to decide whether to validate responses (everywhere except production).
  app.set('env', config.nodeEnv);
  // Render terminates TLS and forwards through exactly one proxy: trusting one hop gives the real
  // client IP (rate limiting) and lets Secure cookies work. Trusting more would let clients spoof
  // X-Forwarded-For.
  if (config.nodeEnv === 'production') app.set('trust proxy', 1);

  // First, so every later middleware (and the access log) can rely on req.id.
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      // Reuse the id set above instead of letting pino-http mint a second, different one.
      genReqId: (req) => req.id,
    }),
  );
  app.use(helmet());
  // Only our own web origin may call the API from a browser, and only it may send cookies.
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(createRateLimiter(config.rateLimit));
  app.use(cookieParser(config.cookieSecret));
  // 100 kB is far above any legitimate request here; it caps the memory a hostile body can cost.
  app.use(express.json({ limit: '100kb' }));
  app.use(createCsrfCheck({ webOrigin: config.webOrigin }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Order matters: unknown routes first, then the error handler that catches everything above.
  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction: config.nodeEnv === 'production' }));

  return app;
}
