import { bootstrap } from './bootstrap.ts';
import { env } from './config/env.ts';
import { closeDb } from './db/client.ts';
import { startReservationSweeper } from './jobs/release-stale-reservations.ts';
import { startJobTicker } from './jobs/runner.ts';
import { createShutdown } from './lib/shutdown.ts';
import { startOutboxDrainer } from './modules/mail/outbox.ts';

// Long-running server (local dev, e2e, any always-on host): build the app, listen, start the
// in-process timers. The serverless entry is vercel.ts. Anything testable lives in createApp().
const { app, logger, payments, outbox } = await bootstrap();

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

// Development convenience: the same runner the CLI and the HTTP trigger use, ticked every 10
// minutes. Not the production plan (a sleeping free-tier host misses ticks): see JOBS_SECRET.
const jobTicker = env.JOBS_IN_PROCESS
  ? startJobTicker({ context: () => ({ log: logger, gateway: payments, outbox }) })
  : null;

const shutdown = createShutdown({
  server,
  logger,
  cleanup: async () => {
    sweeper?.stop();
    drainer?.stop();
    jobTicker?.stop();
    await closeDb();
  },
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
