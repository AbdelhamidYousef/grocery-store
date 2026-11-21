# Phase G10: Testing, CI and deploy

Goal: the whole grocery journey is proven end to end, CI runs it on every push, and the shop is live
on free tiers without a card, the same way Pawsome is (`docs/DEPLOYMENT.md`, Pawsome's
`docs/pawsome-plan/06-handover.md`).

## Learn / explain
- **One journey test that tells the story.** Postcode → basket (a weighed item, a short-dated item,
  a bottle with deposit) → slot → pay with the test card (authorised) → packer picks, records a
  missing item with a swap → shopper rejects the swap → dispatch captures the final amount →
  tracking shows "On the way". Each phase added its own spec; this one is the case study in code.
- **Jobs without a server.** Vercel functions do not run in the background, so the job runner is
  triggered from GitHub Actions on a schedule through `POST /api/v1/internal/jobs/run` with a secret.
  Slot holds expire by themselves (their `expires_at`), so a late job never over-books anything.
- **Migrate before deploy.** A schema change runs on Neon from a shell before the push that needs
  it; the seed is an upsert, but G4 changed stock to per store, so the first deploy resets the
  database (`pnpm db:reset` against Neon) to get the varied shelves.

## Step G10.1: the journey spec
- `e2e/grocery-journey.spec.ts` as above, plus edge specs not covered yet (slot full, express busy,
  unserved postcode at checkout, below minimum order). Flaky specs from earlier phases fixed at
  the cause (the back-in-stock mail window).
- Commit: `test(e2e): the grocery journey from postcode to door`

## Step G10.2: CI
- `.github/workflows/ci.yml` runs gates + e2e with Postgres and Mailpit services (check it still
  matches the new ports, migrations and seed); `jobs.yml` lists the new jobs (generate slots,
  release holds, write off expired, capture overdue, deliver simulated) at sensible intervals
  within the free Actions minutes (public repo: unlimited).
- Commit: `ci: grocery jobs and e2e in CI`

## Step G10.3: deploy
- Vercel project `grocery-store` (one project: static web + Express function, same origin), Neon:
  a new free project in Frankfurt, or a new database in the Pawsome Neon project if the free plan
  allows only one. Stripe sandbox test keys (the Pawsome sandbox is fine), webhook endpoint for the
  new URL, `JOBS_SECRET` + `API_URL` for the jobs workflow. Migrate, reset and seed Neon. Smoke
  test the live journey with the test card. `docs/DEPLOYMENT.md` updated with the grocery specifics.
- Never a card; never solve a CAPTCHA (leave it for the owner in the handover and carry on).
- Commit: `docs(deploy): grocery live on Vercel and Neon`

## Step G10.4: phase end
- Journal, quiz, handover with the live URL, push. Commit: `docs(plan): phase G10 done`
