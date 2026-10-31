import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { createHealthRouter } from './lib/health.ts';
import type { PaymentGateway } from './lib/stripe.ts';
import { createCsrfCheck } from './middleware/csrf.ts';
import { createErrorHandler, notFoundHandler } from './middleware/error.ts';
import { createRateLimiter, type RateLimitOptions } from './middleware/rate-limit.ts';
import { requestId } from './middleware/request-id.ts';
import { createWebhookRouter } from './modules/checkout/webhook.ts';
import { createModulesRouter } from './modules/index.ts';
import type { Outbox } from './modules/mail/outbox.ts';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  webOrigin: string;
  cookieSecret: string;
  rateLimit: RateLimitOptions;
  /** Stricter limit for credential endpoints (login, register, password change). */
  authRateLimit: RateLimitOptions;
  /**
   * Public no-login lookups (order tracking, withdrawals): 10 per hour per IP when omitted.
   * They answer "is this order yours?", so they must be slow to brute-force.
   */
  lookupRateLimit?: RateLimitOptions;
  /**
   * Switches on POST /test/webhooks/simulate (only ever mounted when `nodeEnv` is `test`).
   * `secret` is what the caller must send; `realStripe` says the payment gateway is the real
   * Stripe client, so the simulator must read the amounts from Stripe instead of the database.
   */
  testHooks?: { secret: string; realStripe: boolean };
}

export interface AppDeps {
  logger: Logger;
  /** Resolves when the database answers; injected so health can be tested with an outage. */
  pingDb: () => Promise<void>;
  /** Stripe (or a fake in tests); injected like `pingDb` so no test ever needs the network. */
  payments: PaymentGateway;
  /** Sends the emails the status changes queued (a recording fake in tests). */
  outbox: Outbox;
  // Required (no defaults) so nobody can build a production app with test-grade security by omission.
  config: AppConfig;
}

// The app is built by a function, not at import time, so tests can create as many isolated
// instances as they like and Supertest can drive one without opening a real port.
export function createApp({ logger, pingDb, payments, outbox, config }: AppDeps): Express {
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
  // The Stripe webhook is mounted here, BEFORE the JSON parser and the rate limiter: its signature
  // covers the raw bytes (a parsed body cannot be verified), and a burst of legitimate retries
  // from Stripe's shared IPs must not be rate-limited into failures. It needs no CORS (a server
  // calls it) and no CSRF check (it has no cookies; the signature is its authentication).
  app.use('/api/v1', createWebhookRouter({ payments, outbox }));
  // Only our own web origin may call the API from a browser, and only it may send cookies.
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(createRateLimiter(config.rateLimit));
  app.use(cookieParser(config.cookieSecret));
  // 100 kB is far above any legitimate request here; it caps the memory a hostile body can cost.
  app.use(express.json({ limit: '100kb' }));
  app.use(
    createCsrfCheck({
      webOrigin: config.webOrigin,
      // Stripe calls the webhook server-to-server; the test-only simulator is driven by scripts.
      // Neither has an Origin, and the second route does not exist outside NODE_ENV=test.
      exemptPrefixes: [
        '/api/v1/webhooks/',
        ...(config.nodeEnv === 'test' ? ['/api/v1/test/'] : []),
      ],
    }),
  );

  app.use('/api/v1', createHealthRouter({ pingDb }));
  app.use(
    '/api/v1',
    createModulesRouter({
      authRateLimit: config.authRateLimit,
      ...(config.lookupRateLimit && { lookupRateLimit: config.lookupRateLimit }),
      payments,
      outbox,
      nodeEnv: config.nodeEnv,
      ...(config.testHooks && { testHooks: config.testHooks }),
    }),
  );

  // Order matters: unknown routes first, then the error handler that catches everything above.
  app.use(notFoundHandler);
  app.use(createErrorHandler({ isProduction: config.nodeEnv === 'production' }));

  return app;
}
