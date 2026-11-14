# Phase 0 — Repo bootstrap, tooling, CI skeleton

Goal: an empty but fully wired monorepo where `pnpm typecheck`, `pnpm lint`, `pnpm test` all run
(and pass trivially) locally and in GitHub Actions. Nothing product-specific yet.

Prereqs on his machine: Node 22 (`nvm`), `pnpm` 9+, Docker + compose, `gh` not required, Stripe CLI
(phase 8), `git` with the `gh_y33` SSH alias working (`ssh -T gh_y33`).

## Step 0.1 — git init, ignore, node version
- `git init -b main`; `.nvmrc` = `22`; `.gitignore`: `node_modules`, `dist`, `.env`, `.env.*`,
  `!.env.example`, `coverage`, `playwright-report`, `test-results`, `*.log`, `.DS_Store`. The
  `.gitignore`, `CLAUDE.md` and `docs/plan/` already exist from the planning session; `git init`
  picks them up.
- `.editorconfig` (2 spaces, lf, final newline).
- Acceptance: `git status` shows only intended files.
- Learn / explain: why `.env.*` is ignored but `.env.example` is force-included.
- Commit: `chore(repo): init repository with ignore and editor config`

## Step 0.2 — pnpm workspace + root package.json
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`. Root `package.json` `private: true`, `packageManager`
  pinned, `engines.node >=22`, scripts: `dev` (`pnpm -r --parallel dev`), `build`, `typecheck`
  (`tsc -b`), `lint`, `format`, `format:check`, `test`, `e2e`, `db:migrate`, `db:seed` (filter api).
- `tsconfig.base.json`: strict, `moduleResolution: bundler`, `target ES2022`, `noUncheckedIndexedAccess`,
  path alias none (use workspace package names instead).
- Acceptance: `pnpm install` succeeds with empty workspaces.
- Learn / explain: pnpm's strict node_modules (no phantom deps); workspace protocol `workspace:*`.
- Commit: `chore(repo): add pnpm workspace and base tsconfig`

## Step 0.3 — packages/shared skeleton
- `packages/shared/package.json` (name `@store/shared`, `type: module`, `exports` → `src/index.ts`
  for dev via TS sources; no build step needed because consumers compile it). Deps: `zod`.
- `src/index.ts` exporting `money.ts` (`formatMoney`, `sumCents`, `applyPercent`) and
  `schemas/index.ts` (empty for now) and `errors.ts` (error code enum from the API contract).
- First unit test: `money.test.ts` (rounding, negative guard, currency formatting via `Intl.NumberFormat`).
- Acceptance: `pnpm --filter @store/shared test` passes.
- Learn / explain: why integer cents; `Intl.NumberFormat` vs hand-formatting.
- Commit: `feat(shared): add money helpers and error codes`

## Step 0.4 — apps/api skeleton
- `apps/api/package.json` (name `@store/api`): deps `express@5`, `zod`, `pino`, `pino-http`,
  `dotenv` (only in `env.ts`), dev `tsx`, `typescript`, `vitest`, `supertest`, `@types/*`.
- `src/index.ts` listens; `src/app.ts` exports `createApp()` with just `GET /api/v1/health` returning
  `{ status: 'ok' }` (DB ping added in phase 2).
- `src/app.test.ts` with Supertest: health returns 200.
- Scripts: `dev` (`tsx watch src/index.ts`), `build` (`tsc -p tsconfig.build.json`), `start`, `test`.
- Acceptance: `pnpm --filter @store/api dev` → curl health works; test passes.
- Learn / explain: why `createApp()` is separate from `listen` (testability); ESM in Node 22.
- Commit: `feat(api): scaffold express app with health endpoint`

## Step 0.5 — apps/web skeleton
- `pnpm create vite` equivalent by hand: React 18 + TS + SWC. Deps: `react-router-dom@6.2x`,
  `@tanstack/react-query`, dev `tailwindcss`, `postcss`, `autoprefixer`, `vitest`,
  `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- `vite.config.ts` with `server.proxy['/api'] → http://localhost:3000` (so cookies are same-origin in dev — explain this; it is why no CORS pain locally).
- `src/main.tsx` renders `<App/>` showing "Store" and the API health status fetched via `fetch('/api/v1/health')`.
- One component test proving the test setup works.
- Acceptance: `pnpm dev` runs both; page shows `api: ok`.
- Learn / explain: Vite dev server proxy; why SWC; React StrictMode double-render.
- Commit: `feat(web): scaffold vite react app with api proxy`

## Step 0.6 — lint + format
- Root `eslint.config.js` (flat config) with TS type-checked rules, react-hooks, import ordering;
  `.prettierrc`; `lint-staged` + `simple-git-hooks` running prettier + eslint on staged files
  (`pnpm prepare` installs the hook).
- Acceptance: `pnpm lint` and `pnpm format:check` pass on all workspaces; a deliberately bad file fails.
- Learn / explain: flat config vs legacy; why hooks run only on staged files.
- Commit: `chore(repo): add eslint, prettier and git hooks`

## Step 0.7 — docker compose for local services
- `docker-compose.yml`: `postgres:16-alpine` (db `ecommerce`, plus an init script creating
  `ecommerce_test`), volume, healthcheck; `axllent/mailpit` (ports 1025/8025).
- `.env.example` with every variable so far: `NODE_ENV`, `PORT`, `DATABASE_URL`,
  `DATABASE_URL_TEST`, `WEB_ORIGIN`, `LOG_LEVEL`. Comments on each.
- Acceptance: `docker compose up -d` healthy; `psql` connects to both DBs.
- Learn / explain: why a separate test DB; healthcheck vs `depends_on`.
- Commit: `chore(repo): add docker compose for postgres and mailpit`

## Step 0.8 — CI skeleton
- `.github/workflows/ci.yml`: on push + PR; pnpm cache; jobs: `check` (typecheck, lint, format),
  `test` (Postgres service container, run migrations when they exist, `pnpm test`). E2E job added in phase 11.
- Acceptance: workflow file validated with `act` or by reading; it will run on first push (phase 0 end, when he says push).
- Learn / explain: service containers; why cache pnpm store; concurrency cancel-in-progress.
- Commit: `ci: add check and test workflows`

## Step 0.9 — README stub + first push (on his go)
- Minimal README: name placeholder, one line what it is, "work in progress", local setup commands.
- He picks the repo name (suggestion: `pawsome-store`) and confirms the README wording before the push.
- Create the GitHub repo (public), `git remote add origin gh_y33:<user>/<repo>.git`, push `main`, confirm CI green.
- Commit: `docs: add readme stub`

Phase 0 done when: fresh clone + README commands give a running (empty) app, CI green.
