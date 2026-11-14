import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Logger } from 'pino';

import { db } from '../db/client.ts';
import { jobRuns } from '../db/schema/index.ts';
import type { PaymentGateway } from '../lib/stripe.ts';
import type { Outbox } from '../modules/mail/outbox.ts';
import { sendPetMessages } from '../modules/pets/messages-service.ts';
import { syncFlashSales } from '../modules/promotions/service.ts';
import { sendDueAlerts } from '../modules/stock-alerts/service.ts';

import { runExclusiveSweep } from './release-stale-reservations.ts';

// Scheduled work without a paid scheduler. A job is a name, a cadence and a function; the
// `job_runs` table turns "run it twice" into "run it once":
//
//   claim:  INSERT (name, run_key) ... ON CONFLICT DO NOTHING. The run key is the period the run
//           belongs to (2026-11-08T14 for an hourly job, 2026-11-08 for a daily one, UTC), so the
//           first caller in a period owns it and every later caller sees a conflict and skips.
//   finish: set finished_at. If the job throws, the claim is deleted so the next tick retries.
//   crash:  a claim with no finished_at that is older than CLAIM_STALE_MS belongs to a process
//           that died mid-run; the next caller takes it over.
//
// Who calls `runJob` / `runDueJobs` is a separate, interchangeable question (see cli.ts, the
// in-process ticker in index.ts, and POST /internal/jobs/run): any of them, or all at once, is safe.

export type JobCadence = 'hourly' | 'daily';

export interface JobContext {
  now: Date;
  log: Logger;
  gateway: PaymentGateway;
  outbox?: Outbox | undefined;
}

export interface Job {
  name: string;
  every: JobCadence;
  run: (ctx: JobContext) => Promise<unknown>;
}

/** A claim older than this with no `finished_at` is treated as a crashed run. */
export const CLAIM_STALE_MS = 15 * 60_000;

export const jobs: Job[] = [];

export function registerJob(job: Job): void {
  const existing = jobs.findIndex((j) => j.name === job.name);
  // Replace, never duplicate: modules register at import time and tests import them repeatedly.
  if (existing >= 0) jobs.splice(existing, 1, job);
  else jobs.push(job);
}

export function runKeyFor(every: JobCadence, now: Date): string {
  const iso = now.toISOString(); // always UTC
  return every === 'hourly' ? iso.slice(0, 13) : iso.slice(0, 10);
}

export type RunStatus = 'ran' | 'skipped' | 'failed';
export interface RunOutcome {
  name: string;
  runKey: string;
  status: RunStatus;
  result?: unknown;
  error?: string;
}

async function claim(name: string, runKey: string, now: Date): Promise<boolean> {
  const inserted = await db
    .insert(jobRuns)
    .values({ name, runKey, startedAt: now })
    .onConflictDoNothing()
    .returning({ id: jobRuns.id });
  if (inserted.length > 0) return true;
  // Someone already holds this period. Take it over only if their claim is stale and unfinished.
  const taken = await db
    .update(jobRuns)
    .set({ startedAt: now })
    .where(
      and(
        eq(jobRuns.name, name),
        eq(jobRuns.runKey, runKey),
        isNull(jobRuns.finishedAt),
        lt(jobRuns.startedAt, new Date(now.getTime() - CLAIM_STALE_MS)),
      ),
    )
    .returning({ id: jobRuns.id });
  return taken.length > 0;
}

export async function runJob(name: string, ctx: JobContext): Promise<RunOutcome> {
  const job = jobs.find((j) => j.name === name);
  if (!job) throw new Error(`unknown job "${name}" (known: ${jobs.map((j) => j.name).join(', ')})`);
  const runKey = runKeyFor(job.every, ctx.now);
  if (!(await claim(name, runKey, ctx.now))) return { name, runKey, status: 'skipped' };
  // Every write below is conditional on OUR claim (`started_at` = ctx.now): if a stale run was taken
  // over by a newer caller, the old one finishing late must not mark the new claim finished, and
  // its failure must not delete the new claim.
  const mine = and(
    eq(jobRuns.name, name),
    eq(jobRuns.runKey, runKey),
    eq(jobRuns.startedAt, ctx.now),
  );
  try {
    const result = await job.run(ctx);
    await db
      .update(jobRuns)
      .set({ finishedAt: sql`now()` })
      .where(mine);
    return { name, runKey, status: 'ran', result };
  } catch (err) {
    ctx.log.error({ err, job: name }, 'job failed');
    // Give the period back so the next tick retries instead of waiting for the claim to go stale.
    await db.delete(jobRuns).where(mine);
    return {
      name,
      runKey,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Every registered job, once per its period; the ones already run this period are skipped. */
export async function runDueJobs(ctx: JobContext): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  for (const job of [...jobs]) outcomes.push(await runJob(job.name, ctx));
  return outcomes;
}

// The jobs that exist today. Later phases add theirs with `registerJob` from their own module.
registerJob({
  name: 'release-stale-reservations',
  every: 'hourly',
  // Exclusive: the in-process sweeper and this job share one advisory lock, so they never overlap.
  run: (ctx) =>
    runExclusiveSweep({
      gateway: ctx.gateway,
      log: ctx.log,
      now: ctx.now,
      ...(ctx.outbox && { outbox: ctx.outbox }),
    }),
});

// Flash sales also activate lazily on read (promotions/service.ts), so a late tick never shows a
// wrong price; this job makes the change happen on time even when nobody is browsing.
registerJob({
  name: 'activate-sales',
  every: 'hourly',
  run: (ctx) => syncFlashSales(db, ctx.now),
});

// Back-in-stock alerts: a trigger on `inventory` marks them due, this sends them (once each).
registerJob({
  name: 'send-stock-alerts',
  every: 'hourly',
  run: (ctx) => sendDueAlerts({ outbox: ctx.outbox, log: ctx.log }),
});

// Pet birthday codes and "time to switch food" mails, for confirmed newsletter subscribers only.
registerJob({
  name: 'pet-messages',
  every: 'daily',
  run: (ctx) => sendPetMessages({ now: ctx.now, outbox: ctx.outbox, log: ctx.log }),
});

/** Ticks `runDueJobs` on an interval (development only: `JOBS_IN_PROCESS=true`). */
export function startJobTicker(opts: {
  context: () => Omit<JobContext, 'now'>;
  intervalMs?: number;
  firstRunDelayMs?: number;
}): { stop: () => void } {
  const log = opts.context().log;
  const tick = () => {
    runDueJobs({ ...opts.context(), now: new Date() }).catch((err: unknown) => {
      log.error({ err }, 'job tick crashed');
    });
  };
  const first = setTimeout(tick, opts.firstRunDelayMs ?? 15_000);
  const every = setInterval(tick, opts.intervalMs ?? 10 * 60_000);
  first.unref();
  every.unref();
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
