import { createServer } from 'node:http';

import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { createShutdown } from './shutdown.ts';

const logger = pino({ level: 'silent' });

async function listening() {
  const server = createServer((_req, res) => res.end('ok'));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return server;
}

describe('graceful shutdown', () => {
  it('closes the server, runs cleanup and exits 0', async () => {
    const server = await listening();
    const cleanup = vi.fn(() => Promise.resolve());
    const exit = vi.fn();

    await createShutdown({ server, logger, cleanup, exit })('SIGTERM');

    expect(server.listening).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('runs only once if signalled twice', async () => {
    const server = await listening();
    const cleanup = vi.fn(() => Promise.resolve());
    const exit = vi.fn();
    const shutdown = createShutdown({ server, logger, cleanup, exit });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('exits 1 when cleanup fails', async () => {
    const server = await listening();
    const exit = vi.fn();

    await createShutdown({
      server,
      logger,
      cleanup: () => Promise.reject(new Error('pool stuck')),
      exit,
    })('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('forces exit 1 when cleanup never finishes', async () => {
    const server = await listening();
    const exit = vi.fn();

    void createShutdown({
      server,
      logger,
      cleanup: () => new Promise<void>(() => undefined),
      exit,
      hardTimeoutMs: 50,
    })('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });
});
