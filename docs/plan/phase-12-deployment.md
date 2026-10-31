# Phase 12 — Deployment (free tiers; ask before each sign-up)

Goal: public demo at a stable URL, reproducible from the README.

## Step 12.1 — production hardening checklist (code)
- `NODE_ENV=production` paths: no pretty logs, generic 500 body, `trust proxy`, `Secure` cookies,
  `SameSite=Lax` + cross-site note: web and API are on **different origins** in prod (Vercel vs
  Render) → cookies would be third-party. **Decision:** serve the SPA from the API in prod? No — that
  kills Vercel's CDN. **Chosen:** keep two origins but use a **custom domain with subdomains** if he
  has one (`shop.x.dev` + `api.shop.x.dev`, cookies on the parent domain), **else** proxy `/api/*`
  through Vercel rewrites to Render so the browser sees one origin (`vercel.json` `rewrites`). Go with
  Vercel rewrites by default (free, no domain needed). Document in README.
- `WEB_ORIGIN` = the Vercel URL. Build web with `VITE_API_URL=''` (same origin via rewrite).
- Commit: `feat: production configuration and vercel rewrite`

## Step 12.2 — database: Neon
- Create project (free), get pooled `DATABASE_URL`; run migrations from his machine (`pnpm db:migrate`
  with the prod URL in a shell env, never in a file), seed once. Neon branch `main` only.
- Document: Neon auto-suspends; first request may be slow.

## Step 12.3 — API: Render
- Web service from the repo, root `apps/api`, build `pnpm install --frozen-lockfile && pnpm -F
  @store/api build`, start `node dist/index.js`, env vars set in the dashboard, health check path
  `/api/v1/health`. Free tier sleeps after 15 min → confirmation page copy says "waking up" if the
  first call is slow (small UX touch, already handled by retries).
- Stripe dashboard: add webhook endpoint `https://<render>/api/v1/webhooks/stripe` (test mode),
  copy the signing secret to Render env.

## Step 12.4 — Web: Vercel
- Import repo, root `apps/web`, framework Vite, `vercel.json` with rewrites (`/api/(.*)` → Render) and
  SPA fallback. Env `VITE_STRIPE_PUBLISHABLE_KEY`. Preview deployments per PR (free).

## Step 12.5 — smoke the demo
- Full purchase with `4242…` on the public URL; webhook delivered (Stripe dashboard shows 200);
  confirmation email arrives via Resend when the checkout email is his own address (free tier limit
  without a domain). Record the demo URL in the README.
- `docs/DEPLOYMENT.md` (tracked, short): the exact steps above, so it's reproducible.
- Commit: `docs: add deployment guide`

Phase 12 done when: the demo URL works from a phone and is in the README.
