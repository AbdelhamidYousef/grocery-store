import { defineConfig, devices } from '@playwright/test';

// The e2e suite drives the real app: the Vite dev server (which proxies /api) and the API. Both are
// started here unless already running, so `pnpm e2e` works from a clean shell. The API needs the
// dev database up and seeded (`docker compose up -d && pnpm db:migrate && pnpm db:seed`).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @store/api dev',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @store/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
