# Deploying Pawsome (free tiers, no card, Stripe test mode)

Live demo: <https://pawsome-store-tau.vercel.app> (deployed 2026-11-14).

The whole app runs on **one Vercel project**: the React build is served as static files, and the
Express API runs as a Vercel Function on the same origin (`/api/*`). The database is **Neon**.
Payments are **Stripe test mode**. Scheduled jobs are triggered by **GitHub Actions**. Nothing here
needs a card. (Render was the first plan; its free plan now asks for a card, so it was dropped. See
the decisions log, 2026-11-14.)

```
browser ──► Vercel ── static files (apps/web/dist)
                  └── /api/* ──► Function api/index.js ──► apps/api (Express) ──► Neon (pooled)
Stripe ──webhook──► /api/v1/webhooks/stripe
GitHub Actions (hourly) ──► POST /api/v1/internal/jobs/run
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

   The seed prints the demo logins (`admin@pawsome.test` and customers, one shared password).

## 2. Stripe (test mode)

1. dashboard.stripe.com > sign up (free). Stay in **test mode** (sandbox); no business details are
   needed.
2. **Developers > API keys**: the publishable key (`pk_test_...`) and the secret key
   (`sk_test_...`). The API refuses to boot with a live key.
3. Webhook endpoint (after step 3 gives you the URL), in the dashboard or with the API:
   URL `https://<vercel-domain>/api/v1/webhooks/stripe`, events `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`. Keep its signing
   secret (`whsec_...`).

## 3. Vercel (web + API)

1. vercel.com > sign up (Hobby, free) > **Add New > Project** > import the GitHub repo (install the
   Vercel GitHub app on that repository only).
2. **Root Directory**: `apps/web`. Framework preset: Vite. Leave build and output settings alone:
   `apps/web/vercel.json` sets the build command (`pnpm --filter @store/api build && pnpm build`),
   the function and the rewrites.
3. **Environment Variables** (Production). The dashboard accepts a pasted `.env` block:

   | Variable                      | Value                                                   |
   | ----------------------------- | ------------------------------------------------------- |
   | `DATABASE_URL`                | Neon **pooled** URL                                     |
   | `WEB_ORIGIN`                  | the production URL, e.g. `https://<project>.vercel.app` |
   | `COOKIE_SECRET`               | 32+ random characters                                   |
   | `STRIPE_SECRET_KEY`           | `sk_test_...`                                           |
   | `STRIPE_WEBHOOK_SECRET`       | `whsec_...`                                             |
   | `STRIPE_PUBLISHABLE_KEY`      | `pk_test_...`                                           |
   | `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` (read at build time by the web app)       |
   | `MAIL_FROM`                   | `Pawsome <onboarding@resend.dev>`                       |
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
route every hour (stale reservations, email retries, flash sales, stock alerts, pet emails, upload
sweep). Runs are claimed per period, so an extra or late trigger is harmless.

## 5. Resend (email, optional)

resend.com > sign up > API key `re_...` into `RESEND_API_KEY`. Without a verified domain Resend only
sends from `onboarding@resend.dev` and only delivers to the account owner's address.

## 6. Smoke checklist

1. Home and a product page load with images and prices.
2. Sign in with a demo login; the account page shows the name.
3. Add to cart, check out as a guest, pay with `4242 4242 4242 4242` (any future date, any CVC);
   the confirmation page turns to **paid** (the webhook arrived).
4. Admin: `admin@pawsome.test` sees the order.
5. `curl -X POST -H "X-Jobs-Secret: <secret>" -H 'Content-Type: application/json' -d '{}' https://<domain>/api/v1/internal/jobs/run`
   lists the jobs as `ran`; a wrong secret gets 401.

## Free-tier caveats

- After idle time the first request is slower (function cold start plus Neon waking its compute,
  roughly 1 to 4 seconds).
- Review photo upload is off on the demo; seeded photos are served with the web app.
- The in-process timers of the long-running server (`apps/api/src/index.ts`) do not exist on
  Vercel; the hourly GitHub job replaces them, so a stale reservation is released within the hour
  rather than within minutes.
