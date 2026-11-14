import { env } from '../config/env.ts';
import { closeDb } from '../db/client.ts';
import { selectPaymentGateway } from '../lib/gateway.ts';
import { createLogger } from '../lib/logger.ts';

import { forgetRun, jobs, runDueJobs, runJob } from './runner.ts';

// `pnpm --filter @store/api job run <name> [--force]` runs one job; `job run` with no name runs every job
// that is due; `job list` prints the registry. Put it in cron on any machine, for free. Exit code
// is 1 when a job failed, so cron mail or a CI step notices.
const [command, ...rest] = process.argv.slice(2);
const name = rest.find((a) => !a.startsWith('--'));
// `--force` forgets that the job already ran this period, for a manual re-run (and the e2e suite).
const force = rest.includes('--force');
const log = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });

async function main(): Promise<number> {
  if (command === 'list') {
    for (const j of jobs) console.log(`${j.name}\t${j.every}`);
    return 0;
  }
  if (command !== 'run') {
    console.error('usage: job run [name] | job list');
    return 2;
  }
  const { gateway } = await selectPaymentGateway(env);
  const ctx = { now: new Date(), log, gateway };
  if (force && name) await forgetRun(name, ctx.now);
  const outcomes = name ? [await runJob(name, ctx)] : await runDueJobs(ctx);
  for (const o of outcomes) console.log(JSON.stringify(o));
  return outcomes.some((o) => o.status === 'failed') ? 1 : 0;
}

main()
  .then(async (code) => {
    await closeDb();
    process.exitCode = code;
  })
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exitCode = 1;
  });
