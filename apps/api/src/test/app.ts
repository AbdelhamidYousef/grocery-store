import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { pino, type Logger } from 'pino';

import { createApp, type AppConfig } from '../app.ts';
import { db } from '../db/client.ts';
import { MemoryTransport } from '../lib/mailer.ts';
import type { PaymentGateway } from '../lib/stripe.ts';
import { createOutbox, type Outbox } from '../modules/mail/outbox.ts';

import { FakeStripe } from './fake-stripe.ts';
import { trackPending } from './pending.ts';

// Every fire-and-forget `kick` is tracked so the test run can wait for it before the next test
// wipes the tables (see ./pending.ts). Applies to the default outbox and to one a test passes in.
function withTrackedKicks(real: Outbox): Outbox {
  return {
    drain: () => real.drain(),
    kick: () => {
      trackPending(real.drain());
    },
  };
}

// One folder per test process: nothing in the repo is ever written by the suite.
export const TEST_UPLOAD_DIR = join(tmpdir(), `pawsome-test-uploads-${process.pid}`);
export const TEST_ORIGIN = 'http://localhost:5173';
export const TEST_HOOK_SECRET = 'unit-test-hook-secret-0000';

// One way to build the app in tests: silent logger, a limit too high to trip by accident, and the
// same origin every test sends. Tests override only what they are about.
export function makeTestApp(
  opts: {
    logger?: Logger;
    config?: Partial<AppConfig>;
    pingDb?: () => Promise<void>;
    /** Defaults to a fresh FakeStripe; pass your own to inspect or script it. */
    payments?: PaymentGateway;
    /** Defaults to an outbox over a MemoryTransport nobody inspects. */
    outbox?: Outbox;
  } = {},
) {
  return createApp({
    logger: opts.logger ?? pino({ level: 'silent' }),
    // The real test database by default: most tests want the app exactly as it runs.
    pingDb:
      opts.pingDb ??
      (async () => {
        await db.execute(sql`select 1`);
      }),
    payments: opts.payments ?? new FakeStripe(),
    outbox: withTrackedKicks(
      opts.outbox ??
        createOutbox({ transport: new MemoryTransport(), log: pino({ level: 'silent' }) }),
    ),
    config: {
      nodeEnv: 'test',
      webOrigin: TEST_ORIGIN,
      cookieSecret: 'test-cookie-secret-test-cookie-secret',
      rateLimit: { windowMs: 60_000, limit: 100_000 },
      authRateLimit: { windowMs: 60_000, limit: 100_000 },
      lookupRateLimit: { windowMs: 60_000, limit: 100_000 },
      contactRateLimit: { windowMs: 60_000, limit: 100_000 },
      reviewRateLimit: { windowMs: 60_000, limit: 100_000 },
      voteRateLimit: { windowMs: 60_000, limit: 100_000 },
      newsletterRateLimit: { windowMs: 60_000, limit: 100_000 },
      stockAlertRateLimit: { windowMs: 60_000, limit: 100_000 },
      suggestRateLimit: { windowMs: 60_000, limit: 100_000 },
      uploads: { dir: TEST_UPLOAD_DIR, enabled: true },
      testHooks: { secret: TEST_HOOK_SECRET, realStripe: false },
      ...opts.config,
    },
  });
}
