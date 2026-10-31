import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { createLogger } from './lib/logger.ts';

// Bootstrap only: read config, build the app, listen. Anything testable lives in createApp().
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const app = createApp({
  logger,
  config: {
    nodeEnv: env.NODE_ENV,
    webOrigin: env.WEB_ORIGIN,
    cookieSecret: env.COOKIE_SECRET,
    rateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX },
  },
});

app.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});
