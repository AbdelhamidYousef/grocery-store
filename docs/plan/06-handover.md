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
| 19 Loyalty | building 2026-11-14 on `feat/phase-19` (`../ecommerce-p15`, DB `ecommerce_p15`, API 3115, e2e 3215/5215); rebases onto main at merge (migrations renumber) |
| 16 PDP depth | done, merged 2026-11-14 (structured content, tabs, feeding calculator, size guide, recommendations, delivery estimate, kits with component snapshot on orders; review fixes for kit stock; API 1,063+ pass, e2e 60 + 1 skipped). Kits reuse a component photo until there is art |
| 17 Reviews | done, merged 2026-11-14 (reviews with verified buyer, photo upload to local disk via multer + sharp, helpful votes, ratings on cards/PDP, moderation, shoppable gallery; security-review fixes; API 1,140+ pass, e2e 62 + 1 skipped). Set `UPLOADS_ENABLED=false` on the free-tier demo (ephemeral disk). `sweepOrphanUploads` waits for the phase 19 job runner |
| 22 Post-purchase | building 2026-11-14 on `feat/phase-22` (`../ecommerce-p17` folder, DB `ecommerce_p17`, API 3117, e2e 3217/5217) |
| 24, 21 | queued: 24 after 19 in lane B, then 21 alone |
| 17 Reviews | building 2026-11-14 on `feat/phase-17` (`../ecommerce-p17`, DB `ecommerce_p17`, API 3117, e2e 3217/5217) |
| 21, 22, 24 | queued 2026-11-14: 22 ‖ 24 after 17/19, then 21 alone (touches every screen) |
| 19 Loyalty | in progress: lane `feat/phase-19` (`../ecommerce-p15`, DB `ecommerce_p15`, API 3115, e2e 3215/5215). 19.1 to 19.12 built and committed (job runner, points, redeem, rewards, charity, referrals, newsletter, stock alerts, pet mails, wishlist, buy again, e2e); ready for review and merge, see the notes below the table |
| 16 PDP depth | in progress: lane `feat/phase-16` (`../ecommerce-p16`, DB `ecommerce_p16`, API 3116, e2e 3216/5216) |
| 17 Reviews | queued: after 16 in lane B |
| 21, 22, 24 | not started |

Phase 19 merge notes (19.7 to 19.12, written at the end of the phase):
- Migrations added in this lane: `0025_newsletter`, `0026_stock_alerts` (hand-written trigger on `inventory` at the end: re-append when regenerating), `0027_pet_messages`, `0028_wishlists` (hand-written `updated_at` trigger at the end). Renumber after phase 17's at merge.
- Jobs registered in `jobs/runner.ts`: `send-stock-alerts` (hourly), `pet-messages` (daily). `pnpm --filter @store/api job run <name> --force` forgets the period's claim first (manual re-run; the e2e uses it).
- Mail kinds added to the outbox: `newsletter_confirm`, `newsletter_welcome`, `stock_alert`, `pet_birthday`, `pet_life_stage`. Marketing mail (welcome, pet mail) ends with the one-click unsubscribe link; the stock alert is transactional with a cancel link.
- Review fixes for 19.2 to 19.6 (lead's list) are separate `fix(...)` commits: 50-cent card minimum in the engine, give-back before claw-back, voiding codes held by unpaid orders, referrer row lock, secret before validation, conditional job claims plus `runExclusiveSweep`.
- Not done: kits get no back-in-stock alerts (derived stock has no row to trigger on); no "your friend ordered" mail for referrals; wishlist hearts are product-level (no variant picked); guest wishlists are never cleaned up (add an expiry job later).

Earlier resume notes (written after 19.6, kept for reference):
- Order events are the extension point: `onOrderPaid` / `onOrderCancelled` / `onOrderRefunded` (`modules/orders/events.ts`). Loyalty subscribes in `loyalty/service.ts` (points), `charity-service.ts` and `referrals-service.ts`; each exports a `register...Subscribers()` called from `modules/index.ts`. Handlers run inside the order's transaction, so keep them database-only (no email send; queue through the outbox).
- Jobs: `jobs/runner.ts` has `registerJob({name, every, run})`; the new jobs (`send-stock-alerts` hourly, `pet-messages` daily) register there, and the CLI (`pnpm --filter @store/api job run <name>`), `JOBS_IN_PROCESS` and `POST /api/v1/internal/jobs/run` pick them up with no other change. The GitHub workflow `.github/workflows/jobs.yml` only runs once the repository variable `API_URL` and secret `JOBS_SECRET` exist (needs the owner's OK).
- Personal single-use codes: `loyalty/codes.ts` `mintPersonalCode` (owner-only through `promotions.price`, `max_uses` 1, expiry). The newsletter welcome code (`WELCOME-XXXX`, 10% percent, first order only) needs a `percent` kind: extend `PersonalCodeSpec` (it supports `fixed` and `free_shipping` today) and keep the `WELCOME` prefix; it is not owner-bound (a subscriber may not have an account yet), so pass no owner or add an email-bound variant.
- Money in a code is integer cents; points are integers (1 point = 1 cent); the round-up donation is a separate order field (`orders.donation_cents`) and is part of `totalCents`.
- Migrations: 0018 job_runs, 0019 points_ledger, 0020 rewards, 0021 charity_donations, 0022 referrals. Hand-written SQL (the `updated_at` triggers) is at the end of 0020 and 0021 under a "HAND-WRITTEN" comment, so it can be re-appended when the lead regenerates the migrations after phase 16 merges. Always run prettier from the repo root (`pnpm format`): from a package folder it ignores `.prettierignore` and rewrites the migration snapshots.
- API test suite is slow on a shared machine (every test truncates ~60 tables; 30 to 40 minutes under load). Run single files with `npx vitest run <path>` from `apps/api` while iterating and the whole suite once per commit.
- Not done in 19.1 to 19.6: e2e (19.12 owns `loyalty.spec.ts`; the checkout round-up checkbox and "Use loyalty points" box need a step there), phase 22's `refundId` on `emitOrderRefunded`, an email when a referral qualifies, a real "free product" for the free-toy reward (it mints a EUR 6.99 code), admin visibility of referrals.

Lanes for wave 2 are listed in the table; everything else is on `main`. Tax stays out of scope ("Demo store: no tax is charged"), logged as a decision.

Paused on 2026-11-08 at the owner's request. To resume:
- Both builders were stopped mid-step; their unfinished work is uncommitted in the worktrees (`git -C ../ecommerce-p16 status`, `git -C ../ecommerce-p15 status`). Finish and commit that step first (gates below), then continue with the next step in the phase doc.
- Phase 16 16.7 (in progress): shared `delivery.ts` + tests, a checkout/shipping API change, and `DeliveryEstimate` on the PDP. Its journal and decisions lines are staged in that worktree.
- Phase 19 19.1 (in progress): only the `job_runs` table and its generated migration `0020_job_runs` exist. Phase 16's migrations will also need numbers: whichever of 16 and 19 merges second regenerates its migrations on top of `main` (drizzle-kit generate, re-append hand-written triggers, drop stale `_journal.json` entries).
- Merge order stays 16, 17, 19. Review each phase's diff before it merges; update this table and the README test counts at each merge.
- Gates before every commit: delete stale `*.tsbuildinfo` outside node_modules, `pnpm typecheck && pnpm lint && pnpm format:check`, then the unit suites one package at a time; before `pnpm e2e`, check the lane's e2e ports with `ss -ltnp`.

Known follow-ups:
- e2e specs create and buy products in the shared dev database, so local "Bestsellers" can show E2E test products. A deployed demo starts from the seed and is unaffected.
- Playwright reuses any server already on the e2e ports (`reuseExistingServer: true`). Check `ss -ltnp` before `pnpm e2e`: a leftover dev API there makes many tests fail for no code reason.
- `pnpm typecheck` can pass on a stale `*.tsbuildinfo`; delete those first when in doubt.
- Hero slides still use catalogue photos; generated hero art is a later image task.
- Phase 17 (reviews): seed review photos and the gallery reuse catalogue pictures; live photo upload writes to `UPLOAD_DIR` (ephemeral on Render), so the public demo should set `UPLOADS_ENABLED=false`. Migration `0020_reviews_ugc` (the lead renumbers if phase 19 also took 0019).

Remote viewing: the screenshot tour of the current `main` (phases 0–13) is a private page at
https://claude.ai/artifact/GPjeWpRVGZNQeZVcmnvdz1. For the live dev site on your tailnet, run
`tailscale serve --bg 5173` yourself (the session was not allowed to run it); if Vite blocks the
`.ts.net` host, add it to `server.allowedHosts` in `apps/web/vite.config.ts`.
