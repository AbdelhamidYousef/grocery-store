import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns.ts';

// One row per (job, period). The unique key is what makes "run it twice" a no-op: whoever inserts
// the row first owns that period's run, everybody else sees a conflict and skips. `finished_at`
// null means "claimed, not finished": a crashed run's claim goes stale (see jobs/runner.ts) and a
// later tick takes it over.
export const jobRuns = pgTable(
  'job_runs',
  {
    id: id(),
    name: text('name').notNull(),
    // 2026-11-08T14 (hourly) or 2026-11-08 (daily), in UTC.
    runKey: text('run_key').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique('job_runs_name_run_key_unique').on(t.name, t.runKey)],
);
