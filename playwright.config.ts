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
// payment gateway), and a dev-mode server on :3000 would quietly lack both.
// The API needs the dev database up and seeded (`docker compose up -d && pnpm db:migrate &&
// pnpm db:seed`). Override the ports with E2E_API_PORT / E2E_WEB_PORT if they are taken.
const API_PORT = process.env.E2E_API_PORT ?? '3100';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5273';
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
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
        PORT: API_PORT,
        // The CSRF check compares the browser's Origin with this.
        WEB_ORIGIN,
        // Checkout fills the cart and pays more than the 300/min default allows when specs run
        // in parallel.
        RATE_LIMIT_MAX: '5000',
      },
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @store/web dev --port ${WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      url: WEB_ORIGIN,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
