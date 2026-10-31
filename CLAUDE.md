# CLAUDE.md — Pawsome, e-commerce portfolio project

Tracked agent instructions. Keep under ~100 lines; move one-off detail inline next to the code.

## What this is
Full-stack e-commerce store, a public portfolio piece: a colourful fictional **pet supplies** shop
("Pawsome"). React + TS (Vite SPA) front end, Node (Express 5) API, Postgres (Drizzle), Stripe
**test mode only**. pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`. Public demo on free
tiers (Vercel + Render + Neon). Original content only: made-up brand and products, no live animals.

## The plan
`docs/plan/00-overview.md` is the master plan; phases `phase-00` … `phase-13`, one small step = one
commit. Reference docs: `01-data-model.md`, `02-api-contract.md`, `03-conventions.md`,
`04-decisions-log.md` (append every decision). Read the step's "Learn / explain" before coding.

## Rules
- He must understand every part: explain choices as you go; no tools outside the stack without asking.
- One proper build, no throwaway v1.
- No secrets in the repo: `.env` (ignored) + `.env.example` (documented). Only `sk_test_`/`pk_test_` keys.
- Original content: no real brand, no employer-client code or data; record image licences in `CREDITS.md`.
- Nothing paid, ever. Free-tier sign-ups (Stripe, Neon, Render, Vercel, Resend) are approved; say when one happens.
- Git: commit and push **only when he says**. Remote via SSH alias `gh_y33`. Conventional commits, scoped.
- He decides everything; where he delegates, decide, then log it in `docs/plan/04-decisions-log.md`.
- Later projects (CRO/A-B, CWV, SEO, GA4) are out of scope; keep the guard-rails in the plan (URL state,
  `<Seo>`, `track()` stub, `data-testid`, no fetches inside components).

## Gates (run before any commit; all must pass)
```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm e2e   # before push / at phase end (needs docker compose up and, for payments, `stripe listen`)
```

## Local
```
docker compose up -d          # postgres (5432) + mailpit (8025)
pnpm db:migrate && pnpm db:seed
pnpm dev                      # web :5173 (proxies /api → :3000), api :3000
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

## Traps
- Stripe webhook route must be mounted before `express.json()` (raw body for signature).
- Never run `drizzle-kit push` outside local experiments; migrations are the source of truth.
- Prod web and API are on different origins → `/api/*` goes through Vercel rewrites so cookies work.
- Money is integer cents everywhere. No floats.
- Resend free tier without a domain delivers only to his own address.
