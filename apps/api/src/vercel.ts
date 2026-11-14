import { waitUntil } from '@vercel/functions';

import { bootstrap } from './bootstrap.ts';

// Serverless entry for Vercel (apps/web/api/index.js re-exports this). One instance may serve many
// requests (Fluid compute), so the app is built once per instance at module load.
//
// Differences from the long-running server (index.ts):
// - No timers. The reservation sweeper, the email retry drain and the job registry run from the
//   scheduled GitHub Actions workflow (POST /api/v1/internal/jobs/run, see jobs/runner.ts).
// - An email "kick" after a commit is handed to `waitUntil`, so the instance is kept alive until
//   the send finishes instead of being frozen right after the response.
const { app } = await bootstrap({
  wrapOutbox: (outbox) => ({
    drain: () => outbox.drain(),
    kick: () => {
      waitUntil(outbox.drain().catch(() => undefined));
    },
  }),
});

// Vercel calls the default export of a function file as the request handler.
// eslint-disable-next-line import/no-default-export
export default app;
