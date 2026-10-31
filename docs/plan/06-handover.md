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

## Expansion build status (phases 14–24, as of 2026-11-01)

The expansion session stopped mid-run on 2026-10-31 (~21:20). Nothing from phases 14–24 is merged
into `main` yet; each phase lives on its own branch in a sibling worktree, all committed, none dirty.

| Phase | Branch / worktree | Steps done | Still to do |
|---|---|---|---|
| 14 Catalogue depth | `feat/phase-14` · `../ecommerce-p14` | 14.1–14.10 (10 commits) | merge into `main` (wave 1, first) |
| 20 Content & trust | `feat/phase-20` · `../ecommerce-p20` | 20.1–20.6, 20.8 (7 commits) | 20.7 richer homepage, 20.9 e2e; rebase on 14 after it merges |
| 18 Promotions | `feat/phase-18` · `../ecommerce-p18` | 18.1–18.2 (pure pricing engine in `packages/shared`) | 18.3–18.10 (schema, API, checkout, flash sales, member prices, admin, UI, e2e) |
| 15–17, 19, 21–24 | — | not started | follow the wave order above |

Each lane has its own DB (`ecommerce_pNN`, `ecommerce_pNN_test`) and ports (API 31N0, e2e 32N0/52N3) in
its `.env`.

Checks on 2026-11-01: typecheck, lint and format pass on all three branches. Unit/integration tests
and e2e were **not** re-run. The last runs from the stopped session were unclear: one run of
`pnpm test` failed in `apps/api` (probably phase 18), and one e2e run had 3 failures in
`cart.spec.ts` / `catalog.spec.ts` (lane unknown, possibly 14's bigger catalogue changing seed
assumptions). Re-run `pnpm test` and `pnpm e2e` in each worktree before merging.

Remote viewing: the screenshot tour of the current `main` (phases 0–13) is a private page at
https://claude.ai/artifact/GPjeWpRVGZNQeZVcmnvdz1. For the live dev site on your tailnet, run
`tailscale serve --bg 5173` yourself (the session was not allowed to run it); if Vite blocks the
`.ts.net` host, add it to `server.allowedHosts` in `apps/web/vite.config.ts`.
