# Plan 04 — Decisions log (append-only, newest at the bottom)

Format: date · decision · why · alternatives rejected · revisit when.

- 2026-10-31 · Monorepo with pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`) · one CI, shared Zod schemas · separate repos (duplication), Turborepo (unneeded machinery) · revisit if a third app appears.
- 2026-10-31 · Express 5 over Fastify · interview familiarity; v5 native async errors · Fastify (nicer TS, less known), Hono (too new for the goal) · never, unless perf becomes the point.
- 2026-10-31 · Drizzle over Prisma · learns SQL, readable migrations, light runtime · Prisma (more magic, heavier client) · decided 2026-10-31 (delegated) · never.
- 2026-10-31 · Own cookie-session auth over JWT or an auth SaaS · explainable, revocable sessions, no token refresh dance · JWT (revocation problem), Clerk/Auth0 (outside stack) · revisit for a mobile client.
- 2026-10-31 · Server-side cart from day one (guest via signed cookie) · one build, merge-on-login is a real feature, prices always from the catalog · localStorage cart (would be redone) · never.
- 2026-10-31 · Stripe Payment Intents + Payment Element over Stripe Checkout (hosted) · keeps the checkout UI in the project; teaches webhooks and amount integrity · Checkout (less code, less to learn); can be added as a stretch alternative · never.
- 2026-10-31 · Orders created `pending_payment` before the PaymentIntent, confirmed only by webhook · the client can lie; the webhook can't · creating the order after `payment_intent.succeeded` (race with the confirmation page) · never.
- 2026-10-31 · Postgres full-text search (`tsvector`) over Elastic/Meilisearch · in stack, enough for a few hundred products · revisit at 10k+ products (not this project).
- 2026-10-31 · Vite SPA with SSR guard-rails · simplest fit for the decided stack · React Router framework mode SSR · decided 2026-10-31 (delegated); revisit at the SEO project.
- 2026-10-31 · `attributes jsonb` on products instead of an EAV attribute table · niche-agnostic, facets via jsonb + GIN · EAV (over-engineering for one store) · revisit if attributes need per-key types/validation in admin (then a `attribute_definitions` table).
- 2026-10-31 · Niche: pet supplies store "Pawsome", not a store selling live animals · he wanted animals and colour; live-animal sales are restricted by payment processors and a poor portfolio signal · toy store, coffee store · never.
- 2026-10-31 · Plan and CLAUDE.md tracked in git, no private hub · repo is personal, he is fine with it, and it gives the plan a backup · untracked hub · prune the plan in phase 13.
- 2026-10-31 · Resend free tier for prod email · real-looking order emails; free; without a domain it only delivers to his own address · no prod email, Brevo · add a domain if he ever buys one.
- 2026-10-31 · REVIEW · `.editorconfig` also trims trailing whitespace except in Markdown (two trailing spaces are a line break there) · prevents noisy diffs · no trim at all · never.
- 2026-10-31 · REVIEW · Ignore `.playwright-mcp/` (browser-tool scratch output that appeared in the repo root) · it is local noise, not source · committing it · never.
