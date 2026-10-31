# Plan 00 — Overview, decisions, open questions

_Written 2026-10-31 by the planning session, decisions finalised the same day. This is the master
plan for building the store. Each phase has its own file (`phase-NN-*.md`). Build phases in order;
each step inside a phase is one small, reviewable commit. This folder is tracked in git; prune it in
phase 13 once the README carries the substance._

## What we are building (one paragraph)

A fictional, bright and colourful **pet supplies store** called **Pawsome** (codename `pawsome`).
Categories by pet — Dogs, Cats, Birds, Fish, Small Pets (rabbits, hamsters, guinea pigs) — and
products such as toys, beds, bowls, leashes, cages, aquarium decor and treats, in colour and size
variants. Customers browse, pick a variant (colour × size, or flavour × pack size for treats), add to
a cart that survives reloads and login, check out as guest or account holder, pay with Stripe in test
mode, and see their order history. A small admin area manages products, stock and orders. Everything
is original content (made-up brand, made-up products, openly licensed or generated images).

Why pet supplies: it is naturally colourful (each pet gets its own accent colour and illustration
style), produces **two-axis variants** (colour × size), **weight-based shipping** (a bag of food vs a
collar), **stock per variant**, and **subscriptions as an obvious stretch goal** (recurring food and
litter). It does **not** sell live animals — that would be the wrong signal for a portfolio and is
restricted by most payment processors. The plan is niche-agnostic: only seed data, copy and theme
depend on it.

## Stack (fixed) and the concrete choices inside it

| Layer | Choice | Why this one (what to say in an interview) |
| --- | --- | --- |
| Monorepo | `pnpm` workspaces: `apps/web`, `apps/api`, `packages/shared` | One repo, one CI, shared Zod schemas = one source of truth for API types on both sides. |
| Front end | React 18 + TypeScript, Vite, React Router (data APIs), TanStack Query | Vite = fast, simple, no framework magic to explain. TanStack Query handles server cache, retries, invalidation — the hard part of a store UI. |
| Styling | Tailwind CSS + a tiny set of own components (no UI kit) | Shows he can build a design system, not just install one. Keeps bundle small for the later CWV project. |
| Forms | React Hook Form + Zod resolvers | Same Zod schema validates on client and server. |
| Back end | Node 22 + TypeScript, **Express 5**, Zod validation, Pino logging | Express is the thing interviewers know; v5 has native async error handling. Everything else is explicit middleware he writes himself. |
| DB access | **Drizzle ORM** + `drizzle-kit` migrations, `postgres` driver | SQL-shaped, so he learns real Postgres (joins, transactions, `FOR UPDATE`) instead of an abstraction. Migrations are plain SQL files he can read. |
| Database | Postgres 16 (Docker locally, Neon free tier in prod) | — |
| Auth | Own implementation: cookie sessions stored in Postgres, `argon2id` password hashing, CSRF via SameSite + origin check | No auth SaaS — he must be able to explain sessions vs JWT, hashing, cookie flags. |
| Payments | Stripe **test mode**: Payment Intents + Payment Element, webhooks via Stripe CLI locally | The standard integration; teaches idempotency, webhooks, and "never trust the client with the amount". |
| Email | Local: Mailpit (Docker). Prod: Resend free tier | Order confirmation is expected in a real store. Without a verified domain, Resend's free tier only delivers to his own address — fine for a demo, documented in README. |
| Images | Static files under `apps/web/public/products/` for the demo; `image_url` column so a CDN swap later is trivial | Keep it free and simple. |
| Testing | Vitest (unit), Supertest + real Postgres (integration), Playwright (e2e), GitHub Actions CI | Three-layer pyramid he can describe. |
| Hosting (ask before using) | Web: Vercel (free). API: Render free web service. DB: Neon free. | All free tiers; API sleeps when idle on Render (acceptable for a demo, document it). |

Not in the stack and **not to be added without asking**: Next.js/Remix, Prisma, NextAuth/Clerk/Auth0,
Redux, any component library (MUI, shadcn), GraphQL, Docker in production.

## Non-negotiables (restated as checks)

- **He understands every part.** Each step in each phase has a "Learn / explain" section. Build
  nothing he can't explain; if a step feels like magic, stop and read the docs linked.
- **One proper build.** Don't stub things "for now" that will be redone (e.g. no `localStorage`
  cart that later becomes a server cart; build the server cart once).
- **Public by default.** Secrets only in `.env` (gitignored), every variable documented in
  `.env.example`. Seed data has no real people. Stripe keys are `sk_test_` / `pk_test_` only.
- **Original content.** Made-up brand and products. Images from Unsplash/Pexels (record the licence
  and source per image in `apps/web/public/products/CREDITS.md`) or generated.
- **Ask before money.** Nothing paid. Free tiers only; the free sign-ups (Stripe, Neon, Render, Vercel, Resend) are approved in principle, still say when one is about to happen.
- **Git on his go only.** Each step ends with a proposed commit message; commit when he says.
  Remote: his personal GitHub via the `gh_y33` SSH alias (`git remote add origin gh_y33:<user>/<repo>.git`).

## Scope: in, stretch, out

**In (the full build):**
catalog (categories, products, variants, images, stock) · search + filters + sort + pagination ·
PDP with variant picker · server-side cart (guest + account, merge on login) · accounts
(register, login, logout, addresses, order history) · guest checkout · shipping options (flat +
weight-based) · Stripe test payments with webhook-confirmed orders · inventory reservation and
decrement · order statuses · order confirmation email (local) · admin (products, variants, stock,
orders, status changes) · responsive, accessible UI · tests at three layers · CI · deployed demo ·
README that reads as a case study.

**Stretch (only after everything above is done, in this order):**
discount codes · product reviews · wishlists · subscriptions (Stripe test subscriptions) · Stripe
Checkout as an alternative flow · i18n/currency.

**Out (separate later projects, don't build, don't block):**
CRO / A/B testing · Core Web Vitals work · technical SEO · GA4 tracking. See *Keeping later projects
possible* below.

## Keeping later projects possible (decided)

1. **SPA vs server rendering.** A Vite SPA is the simplest match for "React front end + Node back
   end", but later SEO and CWV projects will want server-rendered or prerendered pages. **Default:
   Vite SPA now**, with these guard-rails so SSR can be added later without a rewrite: all data
   fetching through typed API client functions in `apps/web/src/api/` (no fetches inside
   components), routes defined in one `routes.tsx`, no `window` access outside effects, and URLs
   that are stable and crawlable (`/products/<slug>`, `/c/<category-slug>`). The SEO project can
   then add Vite SSR or prerendering on top. **Decided: SPA.**
2. **Analytics hooks.** Emit a typed `track(event, payload)` function (no-op now) at the key
   moments: view_item_list, view_item, add_to_cart, begin_checkout, purchase. GA4 project later just
   implements the function. Also add stable `data-testid` attributes — the A/B project will need
   stable selectors.
3. **Meta tags.** A tiny `<Seo title description canonical />` component on every page from day one.
   Empty cost now, saves a refactor later.
4. **Performance basics.** Route-level code splitting, image `width`/`height`, lazy images below the
   fold. Not "the CWV project", just not digging a hole.

## Environments

| Env | Web | API | DB | Stripe | Email |
| --- | --- | --- | --- | --- | --- |
| local | `http://localhost:5173` (Vite) | `http://localhost:3000` | Docker Postgres `localhost:5432` | test keys + `stripe listen` | Mailpit `localhost:8025` |
| CI | built, Playwright against preview build | started in CI | Postgres service container | test keys (secret in GH) + mocked webhooks | none |
| prod demo | Vercel | Render | Neon | test keys, real webhook endpoint | Resend free tier |

## Repository layout (target)

```
ecommerce/
  .github/workflows/ci.yml
  .env.example                 # every variable, with comments, no values
  .gitignore
  .nvmrc                       # 22
  package.json                 # pnpm workspace root: scripts only
  pnpm-workspace.yaml
  tsconfig.base.json
  docker-compose.yml           # postgres + mailpit, local only
  README.md                    # case-study style, written in phase 13
  CLAUDE.md                    # tracked: agent instructions for this repo
  docs/plan/                   # this plan (tracked)
  apps/
    api/                       # Express + Drizzle
      src/
        index.ts               # bootstrap only
        app.ts                 # createApp(): express app (importable for tests)
        config/env.ts          # Zod-validated process.env
        db/{client.ts,schema/*.ts,migrations/,seed/}
        modules/<name>/        # router.ts, service.ts, repo.ts, schemas.ts, *.test.ts
        middleware/            # error, auth, csrf, request-id, rate-limit
        lib/                   # logger, errors, money, pagination
      drizzle.config.ts
    web/                       # Vite + React
      src/
        main.tsx, routes.tsx
        api/                   # typed client per resource
        components/{ui,layout,...}
        features/<name>/       # catalog, cart, checkout, account, admin
        hooks/, lib/, styles/
      public/products/         # images + CREDITS.md
  packages/
    shared/                    # zod schemas + TS types + money helpers
  e2e/                         # playwright
```

## Phase index

| # | Phase | File | Rough size |
| --- | --- | --- | --- |
| 0 | Repo bootstrap, tooling, CI skeleton | `phase-00-bootstrap.md` | 1 session |
| 1 | Database schema + migrations + seed | `phase-01-database.md` | 1–2 sessions |
| 2 | API foundation (config, errors, logging, validation, health) | `phase-02-api-foundation.md` | 1 session |
| 3 | Catalog API (categories, products, search, filters) | `phase-03-catalog-api.md` | 1 session |
| 4 | Web foundation (Vite, router, design system, layout, API client) | `phase-04-web-foundation.md` | 1–2 sessions |
| 5 | Catalog UI (home, PLP, PDP, search) | `phase-05-catalog-ui.md` | 2 sessions |
| 6 | Auth & accounts (sessions, register/login, addresses) | `phase-06-auth.md` | 2 sessions |
| 7 | Cart (server-side, guest + merge) | `phase-07-cart.md` | 1–2 sessions |
| 8 | Checkout & Stripe (shipping, payment intent, webhook, order) | `phase-08-checkout-stripe.md` | 2–3 sessions |
| 9 | Orders, inventory, email | `phase-09-orders-inventory-email.md` | 1–2 sessions |
| 10 | Admin | `phase-10-admin.md` | 2 sessions |
| 11 | Testing hardening + CI complete | `phase-11-testing-ci.md` | 1–2 sessions |
| 12 | Deployment (free tiers) | `phase-12-deployment.md` | 1 session |
| 13 | Polish, README, demo, accessibility | `phase-13-polish-readme.md` | 1 session |

Supporting docs: `01-data-model.md` (every table and column), `02-api-contract.md` (every endpoint),
`03-conventions.md` (code style, commit style, testing rules, definition of done),
`04-decisions-log.md` (ADR-style log, append as you go).

## Decisions taken on 2026-10-31 (he delegated these; no HQ sign-off needed from here on)

1. **Niche / brand:** pet supplies store, brand **Pawsome**, codename `pawsome`, order numbers `PW-`.
   Colourful theme: one accent colour per pet category (see phase 4.1).
2. **Rendering:** Vite SPA with the SSR guard-rails above.
3. **ORM:** Drizzle.
4. **Admin:** full admin area (phase 10).
5. **Email:** Mailpit locally, Resend free tier in prod (no domain → deliveries only to his own
   address; README says so).
6. **CLAUDE.md and this plan:** tracked in git. No private hub.
7. **Hosting:** Vercel (web) + Render (api) + Neon (db), free tiers.
8. **Public presentation:** his call now; nothing goes through HQ.
