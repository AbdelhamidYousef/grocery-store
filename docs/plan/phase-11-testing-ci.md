# Phase 11 — Testing hardening and CI completion

Goal: close coverage gaps, make e2e run in CI without Stripe CLI, make the pipeline the gate.

## Step 11.1 — coverage review
- `vitest --coverage` (v8). Target: services ≥ 90 %, routers ≥ 80 %, shared 100 %. List gaps, write
  the missing tests (focus: error paths, auth boundaries, validation).
- Commit: `test: close coverage gaps`

## Step 11.2 — test-only webhook simulation
- `POST /test/webhooks/simulate` exists only when `NODE_ENV=test`: retrieves the real PaymentIntent
  by id from Stripe test API (so it still exercises the real amount check) and runs the shared
  handler. Guarded by a `TEST_HOOK_SECRET` header. Playwright calls it after `confirmPayment`.
- Commit: `test(api): add webhook simulation endpoint for ci`

## Step 11.3 — e2e in CI
- CI job `e2e`: Postgres service, migrate + seed, build web, start api + `vite preview`, Playwright
  with Chromium only, artifacts on failure (trace, video). Stripe test secret stored as a GitHub
  Actions secret (**ask him** before adding; it is a test key but still a secret).
- Commit: `ci: run playwright e2e`

## Step 11.4 — quality gates in CI
- Required checks on `main` (branch protection, ask before enabling), `gitleaks` action,
  `pnpm audit --audit-level=high` (allowed to warn only), dependabot config (weekly, grouped).
- Commit: `ci: add secret scanning, audit and dependabot`

## Step 11.5 — load sanity (not a perf project)
- One `autocannon` run against `/products` locally, record the number in the decisions log; add a
  missing index if `EXPLAIN` shows a seq scan on a filtered query.
- Commit: `perf(api): <only if an index was added>`

Phase 11 done when: a PR with a failing test cannot be merged, and CI is green on `main`.
