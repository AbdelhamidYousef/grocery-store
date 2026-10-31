import { sql } from 'drizzle-orm';
import { pino, type Logger } from 'pino';

import { createApp, type AppConfig } from '../app.ts';
import { db } from '../db/client.ts';

export const TEST_ORIGIN = 'http://localhost:5173';

// One way to build the app in tests: silent logger, a limit too high to trip by accident, and the
// same origin every test sends. Tests override only what they are about.
export function makeTestApp(
  opts: {
    logger?: Logger;
    config?: Partial<AppConfig>;
    pingDb?: () => Promise<void>;
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
    config: {
      nodeEnv: 'test',
      webOrigin: TEST_ORIGIN,
      cookieSecret: 'test-cookie-secret-test-cookie-secret',
      rateLimit: { windowMs: 60_000, limit: 100_000 },
      ...opts.config,
    },
  });
}
