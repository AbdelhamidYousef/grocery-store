import { sql } from 'drizzle-orm';
import { pino, type Logger } from 'pino';

import { createApp, type AppConfig } from '../app.ts';
import { db } from '../db/client.ts';
import { MemoryTransport } from '../lib/mailer.ts';
import type { PaymentGateway } from '../lib/stripe.ts';
import { createOutbox, type Outbox } from '../modules/mail/outbox.ts';

import { FakeStripe } from './fake-stripe.ts';

export const TEST_ORIGIN = 'http://localhost:5173';

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
    outbox:
      opts.outbox ??
      createOutbox({ transport: new MemoryTransport(), log: pino({ level: 'silent' }) }),
    config: {
      nodeEnv: 'test',
      webOrigin: TEST_ORIGIN,
      cookieSecret: 'test-cookie-secret-test-cookie-secret',
      rateLimit: { windowMs: 60_000, limit: 100_000 },
      authRateLimit: { windowMs: 60_000, limit: 100_000 },
      ...opts.config,
    },
  });
}
