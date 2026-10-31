import { sql } from 'drizzle-orm';

import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { closeDb, db } from './db/client.ts';
import { startReservationSweeper } from './jobs/release-stale-reservations.ts';
import { createLogger } from './lib/logger.ts';
import { createMailTransport } from './lib/mailer.ts';
import { createShutdown } from './lib/shutdown.ts';
import { createStripeGateway, createUnconfiguredGateway } from './lib/stripe.ts';
import { createOutbox, startOutboxDrainer } from './modules/mail/outbox.ts';

// Bootstrap only: read config, build the app, listen. Anything testable lives in createApp().
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
// Without a key the server still boots (catalog, cart, account all work) and any payment call
// answers 502 "not configured"; production refuses to boot without one (see config/env.ts).
const payments = env.STRIPE_SECRET_KEY
  ? createStripeGateway({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    })
  : createUnconfiguredGateway();

// Emails: Mailpit in development, Resend or SMTP in production, nothing (logged and skipped) when
// production has neither. The API boots in every case.
const outbox = createOutbox({
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
  },
});

const server = app.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});

// The sweeper needs a configured gateway to ask Stripe about stale orders; without one it would
// only log errors every five minutes, so it stays off.
const sweeper =
  env.ENABLE_JOBS && env.STRIPE_SECRET_KEY
    ? startReservationSweeper({ gateway: payments, log: logger, outbox })
    : null;

// Safety net for emails whose immediate send failed or whose kick was lost to a restart.
const drainer = env.ENABLE_JOBS ? startOutboxDrainer({ outbox, log: logger }) : null;

const shutdown = createShutdown({
  server,
  logger,
  cleanup: async () => {
    sweeper?.stop();
    drainer?.stop();
    await closeDb();
  },
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
