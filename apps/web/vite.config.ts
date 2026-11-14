import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';

// The browser only ever talks to the web origin; Vite forwards /api to the API server. That keeps
// requests same-origin, so session cookies work without CORS or SameSite workarounds. Both the dev
// server and `vite preview` (the production build, used by the CI e2e) need it.
// The e2e suite runs its own API on another port and says so here.
const proxy = { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3001' };

export default defineConfig({
  plugins: [react()],
  // One `.env` at the repo root for the API and the web (only VITE_-prefixed names reach the
  // browser bundle, so the secret keys in the same file are never exposed).
  envDir: '../..',
  server: {
    port: 5174,
    proxy,
  },
  preview: { proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Node's fetch needs absolute URLs; this is the origin the msw handlers answer for.
    env: { VITE_API_URL: 'http://api.test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts', 'src/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
