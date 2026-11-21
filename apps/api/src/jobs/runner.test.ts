import { eq } from 'drizzle-orm';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../db/client.ts';
import { jobRuns } from '../db/schema/index.ts';
import { makeTestApp } from '../test/app.ts';
import { FakeStripe } from '../test/fake-stripe.ts';
import { bodyOf } from '../test/http.ts';

import {
  CLAIM_STALE_MS,
  forgetRun,
  jobs,
  registerJob,
  runDueJobs,
  runJob,
  runKeyFor,
  type JobContext,
} from './runner.ts';

const ctxAt = (iso: string): JobContext => ({
  now: new Date(iso),
  log: pino({ level: 'silent' }),
  gateway: new FakeStripe(),
});

describe('runKeyFor', () => {
  it('is the UTC hour or day', () => {
    const d = new Date('2026-11-08T14:59:59Z');
    expect(runKeyFor('hourly', d)).toBe('2026-11-08T14');
    expect(runKeyFor('daily', d)).toBe('2026-11-08');
  });

  it('is the 5-minute bucket for the five-minutes cadence', () => {
    expect(runKeyFor('five-minutes', new Date('2026-11-08T14:04:59Z'))).toBe('2026-11-08T14:00');
    expect(runKeyFor('five-minutes', new Date('2026-11-08T14:05:00Z'))).toBe('2026-11-08T14:05');
    expect(runKeyFor('five-minutes', new Date('2026-11-08T14:59:59Z'))).toBe('2026-11-08T14:55');
  });
});

describe('runJob', () => {
  const run = vi.fn(() => Promise.resolve<unknown>('done'));
  beforeEach(() => {
    run.mockClear();
    run.mockImplementation(() => Promise.resolve('done'));
    registerJob({ name: 'test-job', every: 'hourly', run });
  });

  it('runs once per period: the same run key twice is a no-op', async () => {
    const first = await runJob('test-job', ctxAt('2026-11-08T14:05:00Z'));
    const second = await runJob('test-job', ctxAt('2026-11-08T14:55:00Z'));
    expect(first).toMatchObject({ status: 'ran', result: 'done', runKey: '2026-11-08T14' });
    expect(second.status).toBe('skipped');
    expect(run).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(jobRuns).where(eq(jobRuns.name, 'test-job'));
    expect(row?.finishedAt).toBeInstanceOf(Date);
  });

  it('runs again in the next period', async () => {
    await runJob('test-job', ctxAt('2026-11-08T14:05:00Z'));
    const next = await runJob('test-job', ctxAt('2026-11-08T15:00:00Z'));
    expect(next.status).toBe('ran');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('two simultaneous callers run it once', async () => {
    const ctx = ctxAt('2026-11-08T14:05:00Z');
    const outcomes = await Promise.all([runJob('test-job', ctx), runJob('test-job', ctx)]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(['ran', 'skipped']);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives the period back when the job throws, so the next tick retries', async () => {
    run.mockRejectedValueOnce(new Error('boom'));
    const failed = await runJob('test-job', ctxAt('2026-11-08T14:05:00Z'));
    expect(failed).toMatchObject({ status: 'failed', error: 'boom' });
    expect(await db.select().from(jobRuns)).toHaveLength(0);
    expect((await runJob('test-job', ctxAt('2026-11-08T14:10:00Z'))).status).toBe('ran');
  });

  it('takes over a stale unfinished claim but not a fresh one', async () => {
    const start = new Date('2026-11-08T14:00:00Z');
    await db
      .insert(jobRuns)
      .values({ name: 'test-job', runKey: '2026-11-08T14', startedAt: start });
    const fresh = await runJob('test-job', ctxAt('2026-11-08T14:05:00Z'));
    expect(fresh.status).toBe('skipped');
    const stale = await runJob(
      'test-job',
      ctxAt(new Date(start.getTime() + CLAIM_STALE_MS + 60_000).toISOString()),
    );
    expect(stale.status).toBe('ran');
  });

  it('a stale run that finishes late cannot touch the newer claim that replaced it', async () => {
    const start = new Date('2026-11-08T14:00:00Z');
    let release!: () => void;
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve('late');
        }),
    );
    const slow = runJob('test-job', { ...ctxAt(start.toISOString()) });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    // the claim goes stale and a newer caller takes it over, and is still running
    const later = new Date(start.getTime() + CLAIM_STALE_MS + 60_000);
    let finishNewer!: () => void;
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNewer = () => resolve('newer');
        }),
    );
    const newer = runJob('test-job', ctxAt(later.toISOString()));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    release();
    await slow;
    const [row] = await db.select().from(jobRuns).where(eq(jobRuns.name, 'test-job'));
    expect(row?.finishedAt).toBeNull();
    expect(row?.startedAt.getTime()).toBe(later.getTime());
    finishNewer();
    await newer;
    const [done] = await db.select().from(jobRuns).where(eq(jobRuns.name, 'test-job'));
    expect(done?.finishedAt).toBeInstanceOf(Date);
  });

  it('forgetRun gives the period back so a manual re-run is possible', async () => {
    const ctx = ctxAt('2026-11-08T14:05:00Z');
    await runJob('test-job', ctx);
    expect((await runJob('test-job', ctx)).status).toBe('skipped');
    await forgetRun('test-job', ctx.now);
    expect((await runJob('test-job', ctx)).status).toBe('ran');
    await expect(forgetRun('nope', ctx.now)).rejects.toThrow(/unknown job/);
  });

  it('rejects an unknown job name', async () => {
    await expect(runJob('nope', ctxAt('2026-11-08T14:00:00Z'))).rejects.toThrow(/unknown job/);
  });
});

describe('registry', () => {
  it('has the existing jobs, once each', () => {
    const names = jobs.map((j) => j.name);
    expect(names).toContain('release-stale-reservations');
    expect(names).toContain('activate-sales');
    expect(new Set(names).size).toBe(names.length);
  });

  it('runDueJobs runs everything once and a second call skips all', async () => {
    const ctx = ctxAt('2026-11-08T14:05:00Z');
    const first = await runDueJobs(ctx);
    expect(first.every((o) => o.status === 'ran')).toBe(true);
    const second = await runDueJobs(ctx);
    expect(second.every((o) => o.status === 'skipped')).toBe(true);
  });
});

type Out = { data: { outcomes: { status: string }[] } };

describe('POST /internal/jobs/run', () => {
  const SECRET = 'jobs-secret-for-tests-1234';
  const app = () => makeTestApp({ config: { jobsSecret: SECRET } });

  it('answers 401 for a wrong or missing secret', async () => {
    await request(app()).post('/api/v1/internal/jobs/run').send({}).expect(401);
    await request(app())
      .post('/api/v1/internal/jobs/run')
      .set('X-Jobs-Secret', 'wrong-secret-wrong-secret')
      .send({})
      .expect(401);
    expect(await db.select().from(jobRuns)).toHaveLength(0);
  });

  it('checks the secret before the body: a bad body without the secret is 401, not 400', async () => {
    await request(app()).post('/api/v1/internal/jobs/run').send({ name: 12345 }).expect(401);
    await request(app())
      .post('/api/v1/internal/jobs/run')
      .set('X-Jobs-Secret', SECRET)
      .send({ name: 12345 })
      .expect(400);
  });

  it('is absent (404) when no secret is configured', async () => {
    await request(makeTestApp())
      .post('/api/v1/internal/jobs/run')
      .set('X-Jobs-Secret', SECRET)
      .send({})
      .expect(404);
  });

  it('runs due jobs without an Origin header, and a second call skips them', async () => {
    const call = () =>
      request(app()).post('/api/v1/internal/jobs/run').set('X-Jobs-Secret', SECRET).send({});
    const first = await call().expect(200);
    expect(bodyOf<Out>(first).data.outcomes.length).toBeGreaterThan(0);
    const second = await call().expect(200);
    expect(bodyOf<Out>(second).data.outcomes.every((o) => o.status === 'skipped')).toBe(true);
  });

  it('re-runs a named job in the same period with force, but only with a name', async () => {
    const call = (body: object) =>
      request(app()).post('/api/v1/internal/jobs/run').set('X-Jobs-Secret', SECRET).send(body);
    expect(
      bodyOf<Out>(await call({ name: 'activate-sales' }).expect(200)).data.outcomes[0],
    ).toMatchObject({
      status: 'ran',
    });
    expect(
      bodyOf<Out>(await call({ name: 'activate-sales' }).expect(200)).data.outcomes[0],
    ).toMatchObject({
      status: 'skipped',
    });
    const forced = await call({ name: 'activate-sales', force: true }).expect(200);
    expect(bodyOf<Out>(forced).data.outcomes[0]).toMatchObject({ status: 'ran' });
    await call({ force: true }).expect(400);
  });

  it('runs one named job and 404s an unknown name', async () => {
    const res = await request(app())
      .post('/api/v1/internal/jobs/run')
      .set('X-Jobs-Secret', SECRET)
      .send({ name: 'activate-sales' })
      .expect(200);
    expect(bodyOf<Out>(res).data.outcomes).toHaveLength(1);
    await request(app())
      .post('/api/v1/internal/jobs/run')
      .set('X-Jobs-Secret', SECRET)
      .send({ name: 'nope' })
      .expect(404);
  });
});
