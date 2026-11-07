# Plan 06 — Handover after the unattended build (2026-10-31)

Written by the build session for the owner. Everything below is local: **nothing is pushed**, no
account was created, nothing is deployed.

## Where things stand

- `main` holds one local commit per plan step (phases 0–11, 12.1, 13.1–13.4), conventional commits.
- Gates on `main`: typecheck, lint, format all clean; unit + integration 1,062 passed, 2 skipped
  (live Stripe); e2e 33 passed, 1 skipped (real card 4242). Lighthouse accessibility 100 on home, PLP,
  PDP, cart, checkout. `gitleaks` over the full history: no leaks.
- Product images: 63 AI-generated with Gemini (personal Google accounts), prompts in
  `apps/web/public/products/CREDITS.md`.

## Read in this order

1. `README.md` — the case study as a stranger will see it.
2. `docs/plan/05-build-journal.md` — per step: what was built, why, and the "Learn / explain"
   answers; a 3-question quiz per phase (no answers: that's your check).
3. `docs/plan/04-decisions-log.md` — every line tagged `REVIEW` is a decision the build sessions made
   on your behalf. Change any you disagree with.
4. `docs/DEPLOYMENT.md` — the click-through for going live.

## Waiting on you

1. **Stripe test account** → put `sk_test_`/`pk_test_`/`whsec_` in `.env`, then run `pnpm test`
   (2 live tests un-skip) and `pnpm e2e` (the real-card test un-skips). This path has never run.
2. **GitHub repo** → name it (plan suggests `pawsome-store`), `git remote add origin gh_y33:<user>/<repo>.git`,
   push, confirm CI green, then enable branch protection (settings listed in the journal, 11.4).
   Optionally add `STRIPE_SECRET_KEY` as an Actions secret.
3. **Deploy (12.2–12.5)** → Neon, Render, Vercel, Resend sign-ups following `docs/DEPLOYMENT.md`;
   then put the demo URL in the README.
4. **13.5 decision** → publish admin demo credentials with a nightly data reset? (plan default: yes).
5. **13.6** → interview notes, written by you with a session's help; then prune `docs/plan/`
   (the README links into it — update those links when pruning).
6. **13.7** → tag `v1.0.0` on your go.
7. **Licence holder** in `LICENSE` is your GitHub handle; change it if you want your name.
8. **Screen reader** pass (NVDA/VoiceOver) on PDP and checkout — couldn't be done here.

## Known limits (also in the README)

- Real Stripe Payment Element and real webhooks never exercised (no keys).
- Home page still shifts layout (~0.22 CLS) while its first request loads — left for the CWV project.
- Gemini output is 1024 px, upscaled to the 1200 px size the seed declares.
- A leftover `tsx watch` dev API from a builder may still hold port 3000; the build session was not
  allowed to kill it. Stop it before `pnpm dev` if the port is busy (a reboot also clears it).

## Expansion build status (phases 14–24, as of 2026-11-07)

Merged into `main` (all gates green on 2026-11-07: shared 180, web 607, API 951 + 2 skipped, e2e 49 + 1 skipped):

| Phase | State |
|---|---|
| 14 Catalogue depth | done, merged |
| 20 Content & trust | done, merged (20.7 homepage: home CLS ~0.22 → ~0.03; 20.9 e2e) |
| 18 Promotions | done, merged (engine, codes, tiers, gift, flash sales + Omnibus, member prices, admin, cart UI, sale banner, e2e) |
| 23 grooming services | cut (decisions log, 2026-11-07) |
| 15 Discovery | done, merged 2026-11-08 (pet profiles, price slider + chips, search autocomplete, mega-menu, gift finder; e2e 56 + 1 skipped). Menu promo tiles use catalogue photos until there is art |
| 19 Loyalty | in progress: lane `feat/phase-19` (`../ecommerce-p15`, DB `ecommerce_p15`, API 3115, e2e 3215/5215) |
| 16 PDP depth | in progress: lane `feat/phase-16` (`../ecommerce-p16`, DB `ecommerce_p16`, API 3116, e2e 3216/5216) |
| 17 Reviews | queued: after 16 in lane B |
| 21, 22, 24 | not started |

Lanes for wave 2 are listed in the table; everything else is on `main`. Tax stays out of scope ("Demo store: no tax is charged"), logged as a decision.

Known follow-ups:
- e2e specs create and buy products in the shared dev database, so local "Bestsellers" can show E2E test products. A deployed demo starts from the seed and is unaffected.
- Playwright reuses any server already on the e2e ports (`reuseExistingServer: true`). Check `ss -ltnp` before `pnpm e2e`: a leftover dev API there makes many tests fail for no code reason.
- `pnpm typecheck` can pass on a stale `*.tsbuildinfo`; delete those first when in doubt.
- Hero slides still use catalogue photos; generated hero art is a later image task.

Remote viewing: the screenshot tour of the current `main` (phases 0–13) is a private page at
https://claude.ai/artifact/GPjeWpRVGZNQeZVcmnvdz1. For the live dev site on your tailnet, run
`tailscale serve --bg 5173` yourself (the session was not allowed to run it); if Vite blocks the
`.ts.net` host, add it to `server.allowedHosts` in `apps/web/vite.config.ts`.
