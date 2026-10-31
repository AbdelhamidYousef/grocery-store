import type { Server } from 'node:http';

import type { Logger } from 'pino';

export interface ShutdownDeps {
  server: Server;
  logger: Logger;
  /** Releases resources the server does not own, e.g. the database pool. */
  cleanup: () => Promise<void>;
  /** Injected so tests can observe the exit code without killing the test runner. */
  exit?: (code: number) => void;
  hardTimeoutMs?: number;
}

// On SIGTERM (what Render sends on deploy) stop taking new connections, let in-flight requests
// finish, close the DB pool, then exit. A timer guarantees we exit even if something never
// drains, because the platform would SIGKILL us anyway and a clean non-zero code is clearer.
export function createShutdown({
  server,
  logger,
  cleanup,
  exit = (code) => process.exit(code),
  hardTimeoutMs = 10_000,
}: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;
  return async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    const hardStop = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      exit(1);
    }, hardTimeoutMs);
    // Do not let this timer itself keep the process alive once everything else has closed.
    hardStop.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        // Idle keep-alive sockets would otherwise hold close() open until they time out.
        server.closeIdleConnections();
      });
      await cleanup();
      clearTimeout(hardStop);
      logger.info('shutdown complete');
      exit(0);
    } catch (err) {
      clearTimeout(hardStop);
      logger.error({ err }, 'error during shutdown');
      exit(1);
    }
  };
}
