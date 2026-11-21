# Deploying Grocery (free tiers, no card, Stripe test mode)

Live demo: <https://grocery-store-bice-two.vercel.app> (deployed 2026-11-21). The Vercel project is
`grocery-store` (root `apps/web`, auto-deploys on every push to `main`), the Neon project is
`grocery-store` (AWS Frankfurt, its own free project, separate from Pawsome's).

The whole app runs on **one Vercel project**: the React build is served as static files, and the
Express API runs as a Vercel Function on the same origin (`/api/*`). The database is **Neon**.
Payments are **Stripe test mode**. Scheduled jobs are triggered by **GitHub Actions**. Nothing here
needs a card. (Render was the first plan for Pawsome; its free plan now asks for a card, so it was dropped. See
the decisions log, 2026-11-14.)

```
browser ──► Vercel ── static files (apps/web/dist)
                  └── /api/* ──► Function api/index.js ──► apps/api (Express) ──► Neon (pooled)
Stripe ──webhook──► /api/v1/webhooks/stripe
GitHub Actions (every 5 minutes) ──► POST /api/v1/internal/jobs/run
```

## 0. GitHub

1. Create an empty repository (no README) and push: `git remote add origin gh_y33:<user>/<repo>.git && git push -u origin main`.
2. CI (`ci.yml`) needs no secrets.

## 1. Neon (database)

1. neon.com > sign up (free) > create a project in the region nearest your users (the demo uses
   AWS Frankfurt).
2. **Connect** dialog: copy the **pooled** URL (host contains `-pooler`). The **direct** URL is the
   same without `-pooler`.
3. Migrate and seed from your machine with the **direct** URL, passed through the shell only (never
   written into `.env`):

   ```sh
   DATABASE_URL='<direct url>' pnpm db:migrate
   DATABASE_URL='<direct url>' pnpm db:seed
   ```

   The seed prints the demo logins (`admin@grocery.test` and customers, one shared password) and
   generates the delivery slots. Grocery's stock is per dark store, so a database that was migrated
   by an older phase needs `pnpm db:reset` once to get varied shelves; the live database was
   migrated and seeded from scratch on 2026-11-21, so it needs no reset.

## 2. Stripe (test mode)

1. dashboard.stripe.com > sign up (free). Stay in **test mode** (sandbox); no business details are
   needed.
2. **Developers > API keys**: the publishable key (`pk_test_...`) and the secret key
   (`sk_test_...`, or a restricted `rk_test_...` key, which is safer: no payouts or transfers). The API refuses to boot with a live key.
3. Webhook endpoint (after step 3 gives you the URL), in the dashboard or with the API:
   URL `https://<vercel-domain>/api/v1/webhooks/stripe`, events `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `payment_intent.canceled`,
   `payment_intent.amount_capturable_updated`, `charge.refunded`. Grocery authorises the card at
   checkout and captures the final amount when the bag is packed; the
   `amount_capturable_updated` event is the one that secures the order. Keep its signing secret
   (`whsec_...`).
   The live demo shares Pawsome's test-mode sandbox but has its own **restricted** test key named
   `grocery-store` (everything except sensitive operations: no payouts or transfers) and its own
   webhook endpoint. The Stripe sandbox issues restricted keys, which is why the API accepts
   `rk_test_` beside `sk_test_` (live keys are still refused).

## 3. Vercel (web + API)

1. vercel.com > sign up (Hobby, free) > **Add New > Project** > import the GitHub repo (install the
   Vercel GitHub app on that repository only; GitHub asks for an email code (sudo mode) to change
   the app's repository access).

   The Vercel CLI now demands two-factor authentication on the account, so the live project was
   created through the dashboard (a signed-in browser) and not with `vercel link`. Use the
   dashboard too.
2. **Root Directory**: `apps/web`. Framework preset: Vite. Leave build and output settings alone:
   `apps/web/vercel.json` sets the build command (`pnpm --filter @store/api build && pnpm build`),
   the function and the rewrites.
3. **Environment Variables** (Production). The dashboard accepts a pasted `.env` block:

   | Variable                      | Value                                                   |
   | ----------------------------- | ------------------------------------------------------- |
   | `DATABASE_URL`                | Neon **pooled** URL                                     |
   | `WEB_ORIGIN`                  | the production URL, e.g. `https://<project>.vercel.app` |
   | `COOKIE_SECRET`               | 32+ random characters                                   |
   | `STRIPE_SECRET_KEY`           | `sk_test_...` or `rk_test_...` (restricted)             |
   | `STRIPE_WEBHOOK_SECRET`       | `whsec_...`                                             |
   | `STRIPE_PUBLISHABLE_KEY`      | `pk_test_...`                                           |
   | `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (read at build time by the web app)       |
   | `MAIL_FROM`                   | `Grocery <onboarding@resend.dev>`                       |
   | `UPLOADS_ENABLED`             | `false` (function disks are not persistent)             |
   | `ENABLE_JOBS`                 | `false` (no timers in a function)                       |
   | `JOBS_SECRET`                 | 16+ random characters, same as the GitHub secret        |
   | `RESEND_API_KEY`              | optional, `re_...`; without it emails are skipped       |
   | `LOG_LEVEL`                   | `info` (optional)                                       |

   Random values: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

4. Deploy. Every push to `main` redeploys.

Check: `https://<domain>/api/v1/health` returns `{"status":"ok","db":"ok",...}`.

## 4. Scheduled jobs (GitHub Actions)

Repository **Settings > Secrets and variables > Actions**: variable `API_URL` = the production URL,
secret `JOBS_SECRET` = the same value as on Vercel. `.github/workflows/jobs.yml` then calls the jobs
route every 5 minutes (the shortest cron GitHub allows). Each call runs the whole registry; the
database claims one run per period for each job, so the 5-minute jobs (simulated delivery, slot-hold
clean-up) run every time, the hourly ones (capture overdue, email retries, stock alerts, flash sales,
stale reservations) and the daily ones (generate slots, write off expired) run once in their hour or
day. An extra or late trigger is harmless. Run it by hand from the **Actions** tab (`Run workflow`)
to check the setup.

## 5. Resend (email, optional)

resend.com > sign up > API key `re_...` into `RESEND_API_KEY`. Without a verified domain Resend only
sends from `onboarding@resend.dev` and only delivers to the account owner's address.

## 6. Smoke checklist

1. Home and a product page load with images and prices.
2. Sign in with a demo login; the account page shows the name.
3. Enter a Berlin postcode (10115), add a basket over 15.00 EUR, check out as a guest, choose a
   delivery slot, pay with `4242 4242 4242 4242` (any future date, any CVC). The card is only
   authorised; the confirmation page turns to **confirmed** (the webhook arrived).
4. Admin: `admin@grocery.test` sees the order and can pack and dispatch it (which captures the
   final amount). `/api/v1/delivery/...` resolves postcode 12045 to Neukölln.
5. `curl -X POST -H "X-Jobs-Secret: <secret>" -H 'Content-Type: application/json' -d '{}' https://<domain>/api/v1/internal/jobs/run`
   lists the jobs as `ran`; a wrong secret gets 401.

## Free-tier caveats

- After idle time the first request is slower (function cold start plus Neon waking its compute,
  roughly 1 to 4 seconds).
- Review photo upload is off on the demo; seeded photos are served with the web app.
- The in-process timers of the long-running server (`apps/api/src/index.ts`) do not exist on
  Vercel; the 5-minute GitHub job replaces them. GitHub may delay a scheduled run by minutes under
  load, so the simulated delivery and the hold clean-up can be late. Slot holds expire by their own
  `expires_at`, so a late run never over-books a slot.
- Emails are skipped on the demo (no `RESEND_API_KEY`).
