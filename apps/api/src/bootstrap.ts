import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';

import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { db } from './db/client.ts';
import { selectPaymentGateway } from './lib/gateway.ts';
import { createLogger } from './lib/logger.ts';
import { createMailTransport } from './lib/mailer.ts';
import { createOutbox, type Outbox } from './modules/mail/outbox.ts';

// apps/api, so a relative UPLOAD_DIR means the same folder wherever the process was started from.
const API_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Everything the API needs before it can answer a request: config, logger, payment gateway, email
 * outbox and the Express app. Shared by the long-running server (index.ts) and the Vercel function
 * (vercel.ts); only what happens around it differs (listen + timers vs. one request at a time).
 *
 * `wrapOutbox` lets the host change how a "send the emails now" kick runs. On Vercel the function
 * may be frozen as soon as the response is sent, so the kick is handed to `waitUntil`.
 */
export async function bootstrap(opts: { wrapOutbox?: (outbox: Outbox) => Outbox } = {}) {
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
  // Without a key the server still boots (catalog, cart, account all work) and any payment call
  // answers 502 "not configured"; production refuses to boot without one (see config/env.ts).
  // Under NODE_ENV=test with no key it boots a fake gateway instead, for the e2e suite.
  const { kind: gatewayKind, gateway: payments } = await selectPaymentGateway(env);
  if (gatewayKind === 'fake')
    logger.warn('using the FAKE payment gateway (NODE_ENV=test, no Stripe key)');
  if (env.NODE_ENV === 'test' && !env.TEST_HOOK_SECRET)
    logger.warn('TEST_HOOK_SECRET is not set: POST /test/webhooks/simulate is disabled');

  // Emails: Mailpit in development, Resend or SMTP in production, nothing (logged and skipped)
  // when production has neither. The API boots in every case.
  const baseOutbox = createOutbox({
    transport: createMailTransport(
      {
        nodeEnv: env.NODE_ENV,
        from: env.MAIL_FROM,
        smtpUrl: env.SMTP_URL,
        resendApiKey: env.RESEND_API_KEY,
      },
      logger,
    ),
    log: logger,
  });
  const outbox = opts.wrapOutbox ? opts.wrapOutbox(baseOutbox) : baseOutbox;

  const app = createApp({
    logger,
    pingDb: async () => {
      await db.execute(sql`select 1`);
    },
    payments,
    outbox,
    config: {
      nodeEnv: env.NODE_ENV,
      webOrigin: env.WEB_ORIGIN,
      cookieSecret: env.COOKIE_SECRET,
      rateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX },
      authRateLimit: { windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS, limit: env.RATE_LIMIT_AUTH_MAX },
      uploads: { dir: resolve(API_ROOT, env.UPLOAD_DIR), enabled: env.UPLOADS_ENABLED },
      ...(env.JOBS_SECRET && { jobsSecret: env.JOBS_SECRET }),
      // The simulation switch only counts when there is no gateway at all, so it can never hide a
      // real Stripe failure (see config/env.ts).
      returns: {
        windowDays: env.RETURN_WINDOW_DAYS,
        simulated: env.RETURNS_SIMULATED && gatewayKind === 'unconfigured',
      },
      ...(env.TEST_HOOK_SECRET && {
        testHooks: { secret: env.TEST_HOOK_SECRET, realStripe: gatewayKind === 'stripe' },
      }),
    },
  });

  return { app, logger, payments, outbox };
}
