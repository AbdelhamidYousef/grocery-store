import { pino, type Logger } from 'pino';

import { createApp, type AppConfig } from '../app.ts';

export const TEST_ORIGIN = 'http://localhost:5173';

// One way to build the app in tests: silent logger, a limit too high to trip by accident, and the
// same origin every test sends. Tests override only what they are about.
export function makeTestApp(opts: { logger?: Logger; config?: Partial<AppConfig> } = {}) {
  return createApp({
    logger: opts.logger ?? pino({ level: 'silent' }),
    config: {
      nodeEnv: 'test',
      webOrigin: TEST_ORIGIN,
      cookieSecret: 'test-cookie-secret-test-cookie-secret',
      rateLimit: { windowMs: 60_000, limit: 100_000 },
      ...opts.config,
    },
  });
}
