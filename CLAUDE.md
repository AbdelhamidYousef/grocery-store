# CLAUDE.md: Grocery, quick-delivery e-commerce portfolio project

The shop's public name is simply **Grocery**: names here are plain and say what the thing is, never clever.

Tracked agent instructions. Keep under ~100 lines.

## What this is
The second e-commerce portfolio piece: a fictional **quick home-delivery shop** for groceries and home
basics (Amazon Now / Getir style). Copied from the owner's Pawsome repo (pet supplies) with full
history. Same stack: React + TS (Vite SPA), Node (Express 5) API, Postgres (Drizzle), Stripe **test mode
only**. pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`. Original content only: a made-up brand, made-up products and generated images.

## The plan
`docs/plan/00-overview.md` is the master plan (phases G0–G11). Start at G0. Pawsome's plan stays in
`docs/pawsome-plan/` as a reference for the engine. Don't edit it. Write each phase file when its phase
starts, then keep `docs/plan/04-decisions-log.md`, `05-build-journal.md` and `06-handover.md` current with every step.

## Rules
- He must understand every part: explain choices as you go; no tools outside the stack without asking.
- He delegates technical decisions: pick the recommended option, say it in one line, log it. Ask only
  about money, public presentation and taste (name, colours).
- No secrets in the repo: `.env` (ignored) + `.env.example`. Only `sk_test_`/`pk_test_` keys.
- Nothing paid, ever, and no card on any sign-up. Free-tier sign-ups are approved; say when one happens.
- Git: commit locally per step; push at phase ends to his personal GitHub (`gh_y33`), as approved in
  `work/KICKOFF.md` (2026-11-14), which also approves the public deploy. Conventional commits, scoped.
- Images: Gemini in the Playwright browser, the same pipeline as Pawsome (prompts in `docs/plan/data/image-grids.json`, `tools/crop-grids.mjs`, `pnpm images:process`).
- The portfolio story is **logistics** (areas, slots, expiry, weight, substitutions): don't redo what Pawsome already shows.
- Shared-engine fixes from Pawsome: `git fetch pawsome` then cherry-pick; never merge Pawsome wholesale.

## Gates (run before any commit; all must pass)
```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm e2e   # at phase end
```

## Local (ports are Pawsome's + 1 so both run at once; e2e uses 3101/5274)
```
docker compose up -d          # postgres 5433 + mailpit 8026
pnpm db:migrate && pnpm db:seed
pnpm dev                      # web :5174 (proxies /api → :3001), api :3001
```

## Traps
- Local Postgres runs with `fsync=off` (tests truncate ~80 tables per test); after a crash, `docker compose down -v` and re-seed.
- `tsc -b` can pass on stale `*.tsbuildinfo`: delete them (outside node_modules) before trusting typecheck.
- Stripe webhook route must be mounted before `express.json()`.
- Migrations are the source of truth; never `drizzle-kit push` outside experiments.
- Money is integer cents everywhere, including weighed items (price per kg × grams, rounded once, documented).
