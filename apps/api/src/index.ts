import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { createLogger } from './lib/logger.ts';

// Bootstrap only: read config, build the app, listen. Anything testable lives in createApp().
const logger = createLogger(env.LOG_LEVEL);
const app = createApp({ logger });

app.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});
