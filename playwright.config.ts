import { defineConfig, devices } from '@playwright/test';

// Node 22 can read the repo-root `.env` itself (it never overrides variables already set), so the
// Stripe keys the checkout e2e looks for are visible here without a new dependency.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env yet: the tests that need keys skip themselves, loudly.
}

// The e2e suite drives the real app on ports of its own, so it never collides with (or silently
// reuses) a `pnpm dev` session. That matters: the payment tests need an API started with
// NODE_ENV=test (it exposes POST /test/webhooks/simulate and, without a Stripe key, boots a fake
// payment gateway), and a dev-mode server on :3001 would quietly lack both.
// To run against a database of your own (two suites at once), start with
// DATABASE_URL=postgres://.../other_db: it is what the e2e API uses (see below).
// The API needs the dev database up and seeded (`docker compose up -d && pnpm db:migrate &&
// pnpm db:seed`). Override the ports with E2E_API_PORT / E2E_WEB_PORT if they are taken.
// The test-only payment simulator refuses callers without this secret. A throwaway value is fine
// here: the e2e API is started by this config on localhost, and CI overrides nothing. Set before
// the workers start so the tests (which send it) and the API (which checks it) agree. `||=` also
// replaces the empty value a copied .env.example carries.
process.env.TEST_HOOK_SECRET ||= 'e2e-test-hook-secret-not-a-real-secret';
// The jobs endpoint (POST /internal/jobs/run) exists only with a secret; the e2e suite runs jobs through it
// (in the API process, with `force`) instead of spawning the job CLI, which is slow and flaky under load.
process.env.JOBS_SECRET ||= 'e2e-jobs-secret-not-a-real-secret';

const API_PORT = process.env.E2E_API_PORT ?? '3101';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5274';
// `preview` serves apps/web/dist (run `pnpm --filter @store/web build` first, as CI does).
const WEB_MODE = process.env.E2E_WEB_MODE === 'preview' ? 'preview' : 'dev';
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_ORIGIN,
    // Kept only for failed tests, so a green run uploads nothing; CI attaches them as artifacts.
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @store/api dev',
      env: {
        NODE_ENV: 'test',
        // NODE_ENV=test makes the API use DATABASE_URL_TEST (a scratch database the unit tests
        // truncate). The e2e needs the seeded dev data, so point that variable at it.
        ...(process.env.DATABASE_URL ? { DATABASE_URL_TEST: process.env.DATABASE_URL } : {}),
        // NODE_ENV=test sends no mail without a transport; point it at Mailpit (docker compose)
        // so the admin spec can check the shipped email. Nothing listening is harmless: the
        // outbox retries later and that assertion skips itself.
        SMTP_URL: process.env.SMTP_URL || 'smtp://127.0.0.1:1026',
        PORT: API_PORT,
        TEST_HOOK_SECRET: process.env.TEST_HOOK_SECRET,
        JOBS_SECRET: process.env.JOBS_SECRET,
        // The CSRF check compares the browser's Origin with this.
        WEB_ORIGIN,
        // Checkout fills the cart and pays more than the 300/min default allows when specs run
        // in parallel.
        RATE_LIMIT_MAX: '5000',
        // Sign-ins are limited per address and email (10 / 15 min by default); the admin spec
        // signs the one demo admin in for almost every test.
        RATE_LIMIT_AUTH_MAX: '1000',
      },
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // CI builds the web app first and serves the production bundle (minified, the same code that
      // ships); locally the dev server starts in a second and needs no build step.
      command: `pnpm --filter @store/web ${WEB_MODE === 'preview' ? 'preview' : 'dev'} --port ${WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      url: WEB_ORIGIN,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
