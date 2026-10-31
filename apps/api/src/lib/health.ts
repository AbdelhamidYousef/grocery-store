import { Router } from 'express';

import { version } from './version.ts';

export interface HealthDeps {
  /** Resolves if the database answers, rejects otherwise. */
  pingDb: () => Promise<void>;
  timeoutMs?: number;
}

// A hung database must not hang the health endpoint too: the platform's probe would time out
// with no information. Racing against a timer turns "stuck" into a clean, fast "down".
async function pingWithin(pingDb: () => Promise<void>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('db ping timed out')), ms);
  });
  try {
    await Promise.race([pingDb(), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 503 (not 200) when the DB is down, so load balancers and uptime monitors that only look at the
// status code take the instance out of rotation.
export function createHealthRouter({ pingDb, timeoutMs = 1000 }: HealthDeps): Router {
  const router = Router();
  router.get('/health', async (req, res) => {
    const dbOk = await pingWithin(pingDb, timeoutMs);
    if (!dbOk) req.log.error('health check: database unreachable');
    res
      .status(dbOk ? 200 : 503)
      .json({ status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'down', version });
  });
  return router;
}
