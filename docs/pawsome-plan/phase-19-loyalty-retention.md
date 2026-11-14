# Phase 19 — Loyalty & retention

Goal: give customers reasons to come back (points, referrals, wishlist, alerts, pet-aware emails) without a single mutable balance or paid service.

## Learn / explain
- **Ledger, not balance**: points are append-only rows; balance = `SUM(delta)`. Every row has an idempotency key so retries and double webhooks cannot double-award.
- **Reversal instead of edit**: a refund adds a negative row; history stays auditable.
- **Double opt-in**: consent is proven by a click from the inbox (signed, expiring token), which is what GDPR-style rules expect.
- **Scheduled work without a paid scheduler**: a job registry plus a run-key table makes "daily" jobs safe to trigger twice.
- **Rewards as discount codes**: loyalty plugs into phase 18 instead of inventing a second discount path.

## Rules (decided here, logged in the decisions log at build time)
- Earn 1 point per whole EUR of paid merchandise after discounts (not shipping, not the points-paid part); tiers raise the rate (x1, x1.25, x1.5 using integer maths on cents). Redeem 100 points = EUR 1 (1 point = 1 cent). No expiry (simpler and kinder; rejected: 12-month expiry needing a sweep job).
- Tiers from lifetime earned points: Pup 0, Good Dog 500, Top Dog 2000. Computed from the ledger, never stored.
- Stripe is not configured: "paid" means the simulated gateway's paid event, the same hook the real webhook will call.

## Step 19.1 — job runner (free scheduling)
- `apps/api/src/jobs/runner.ts`: registry `{name, every:'hourly'|'daily', run(now)}`; `job_runs(name, run_key unique, finished_at)` makes reruns no-ops. Register the existing release-stale-reservations job and phase 18's `activate-sales` (this phase is the single owner of the runner; 18 calls it lazily until then).
- Three ways to trigger, all free: CLI `pnpm --filter api job run <name>` (cron on any machine); `JOBS_IN_PROCESS=true` ticks every 10 minutes in `pnpm dev`; in production a scheduled GitHub Actions workflow `POST /internal/jobs/run` with a secret header (also wakes the sleeping Render service). In-process alone is unreliable on Render free, so it is not the production plan.
- Tests: same run_key twice runs once; wrong secret 401.
- Commit: `feat(api): add job runner and cron entry points`

## Step 19.2 — points ledger + earning
- `points_ledger(id, user_id, delta, kind earn|redeem|reversal|bonus|donate|adjust, order_id null, ref_key unique, created_at)`. Shared `pointsForCents(cents, tier)`. Award via the phase 14 `onOrderPaid` event (idempotent `earn:<orderId>`; the paid test is shared `isPaidOrLater`); guests earn nothing (PDP says "Sign in to earn").
- `GET /me/points` balance, tier, next-tier gap, last 50 rows. PDP and cart show "Earn N points" via the shared function. Admin can add an `adjust` row with a reason.
- Tests: tier boundary maths, double paid event awards once, balance equals sum.
- Commit: `feat(api): add points ledger and earning`

## Step 19.3 — redeem at checkout + reversal
- Checkout accepts `pointsToRedeem`; service locks the user row (`FOR UPDATE`), checks balance, passes a `credits` entry to the phase 18 engine, writes a `redeem` row in the same transaction as the order. Cap: at most the remaining merchandise total.
- `reversePointsForOrder(orderId, refundedCents)` writes proportional `reversal` rows (ref `refund:<id>`) and gives back redeemed points on cancelled or failed orders. It is registered as a subscriber of the phase 14 order events (`onOrderCancelled`, `onOrderRefunded`), so it needs no code from phase 22: phase 22 simply emits `onOrderRefunded` from its refund service. Same subscription reverses referral codes and the donation row (below).
- Tests: two parallel checkouts cannot spend the same points; reversal can push balance negative only through `adjust` (otherwise clamps at earned-to-date rule, documented); failed payment returns points.
- Commit: `feat(api): redeem points at checkout and reverse on refund`

## Step 19.4 — rewards shop + account page
- `rewards(id, name, cost_points, kind coupon_fixed|free_shipping|gift, value_cents, active)`. Redeeming debits points and mints a personal `discount_code` (phase 18: `owner_user_id`, single use, 60-day expiry). Account `/account/rewards`: balance, tier badge, ledger table, rewards grid.
- Admin CRUD for rewards. Seed 4 rewards (EUR 5, EUR 10, free shipping, free toy).
- Commit: `feat(web): add rewards page and admin rewards`

## Step 19.5 — charity
- Fictional shelter "Whisker Hollow Rescue" (seeded `charities` row). Two ways: donate points on the rewards page (`donate` ledger row + `donations` row), or checkout round-up (engine `roundUpDonation` adds up to the next whole EUR as a separate line, never discounted, stored as `orders.donation_cents`; the total check constraint is extended in this migration). Running total = `SUM(donations)` in a small public endpoint, shown in the footer and on `/charity`. Clearly labelled demo: no money moves.
- Tests: round-up of 2350 is 50, whole-euro totals add 0; donation counted once per order; refunded order's donation reversed.
- Commit: `feat(api): add charity donations and round-up`

## Step 19.6 — referrals
- `referral_codes(user_id unique, code)`, `referrals(id, referrer_id, referred_user_id unique, status pending|qualified|rejected, qualified_order_id)`. Link `/?ref=CODE` stored in a cookie, attached at registration. On the referee's first `paid` order of at least EUR 20, both get a single-use EUR 5 personal code (min spend EUR 20, 90 days). Rejected: a wallet-credit table (a second money ledger to keep correct).
- Abuse limits: no self-referral (same normalised email, or same shipping-address hash as the referrer); referee must be a new account; max 10 qualified referrals per referrer per year; codes voided if the qualifying order is fully refunded before use (via the `onOrderRefunded` event; phase 22 emits it).
- Tests: each limit, idempotent qualification, both codes minted once.
- Commit: `feat(api): add refer-a-friend`

## Step 19.7 — newsletter with double opt-in
- `newsletter_subscribers(email citext unique, status pending|confirmed|unsubscribed, token_hash, pets jsonb, user_id null, consent_text, confirmed_at)`. Footer/form (the homepage block registers as the `newsletter` `HomeSlot`, phase 20 owns the registry): email + "Which pets do you have?" checkboxes. Email (Mailpit locally) carries a confirm link (48h); confirming mints a unique `WELCOME-XXXX` 10% code (`first_order_only`, one use, 30 days) and sends it. Every mail has a one-click unsubscribe link. Re-subscribing a confirmed address does not mint a second code.
- Rate limit per IP; same response for known and unknown emails (no enumeration).
- Tests: unconfirmed gets no code; expired token; second confirm is a no-op; code refused on a second order.
- Commit: `feat(api): add newsletter double opt-in with welcome code`

## Step 19.8 — back-in-stock alerts
- `stock_alerts(id, variant_id, email, user_id null, status waiting|sent|cancelled, token, created_at, sent_at)`, unique waiting per (variant, email), max 5 waiting per email. PDP sold-out variant shows "Email me when back" (guest email field, prefilled when signed in).
- When available stock goes from 0 to above 0 (admin set, released reservation) the inventory service marks alerts due; job `send-stock-alerts` (hourly) emails once, with a cancel link, and marks `sent`.
- Tests: only the 0-to-positive transition fires; one email per alert; cancelled skipped.
- Commit: `feat(api): add back-in-stock alerts`

## Step 19.9 — pet birthday perk + life-stage emails
- **Depends on phase 15 (pet profiles)**: uses `pets(id, user_id, name, species, birthday)` exactly as phase 15 defines it (`birthday` is a plain `date`). Only for users with confirmed newsletter consent.
- Daily job `pet-messages`: birthday (Feb 29 treated as Feb 28 in common years) mints a 10% personal code valid 14 days; life-stage mail at 8 weeks, 6 months and 12 months for puppies and kittens ("time to switch food"), linking to the matching category. `pet_messages(pet_id, kind, period_key, unique)` guarantees once per pet per year or milestone.
- Tests: leap day, pet without birth date skipped, no consent skipped, second run sends nothing.
- Commit: `feat(api): add pet birthday and life-stage emails`

## Step 19.10 — wishlist (account + guest) and share link
- `wishlists(id, user_id null, guest_token null, share_token null)`, `wishlist_items(wishlist_id, product_id, variant_id null, unique)`. Guest identity reuses the cart's cookie approach; merge on login like the cart merge. Heart on PLP card and PDP, `/wishlist` page (move to cart, remove), "Share" toggle creates `/w/:token`: read-only, `noindex`, shows first name only.
- Tests: guest then login merge without duplicates; unshared token 404; revoked token stops working.
- Commit: `feat(web): add wishlist with share link`

## Step 19.11 — buy again / reorder
- `GET /me/buy-again` (distinct variants from paid orders, newest first, with current price and availability); `POST /me/orders/:id/reorder` adds available lines through the cart service and reports skipped ones. Header link for signed-in users and an account block.
- Commit: `feat(web): add buy again shortcut`

## Step 19.12 — e2e
- Spec `loyalty.spec.ts`: sign up newsletter in Mailpit, confirm, receive code, order with it; paid order shows "+N points", redeem them on the next order; share wishlist link opens logged out; sold-out alert signup then admin restocks and job CLI sends mail. Gateway is simulated.
- Commit: `test(e2e): add loyalty flows`

Phase 19 done when: points, referral and welcome credits all flow through the phase 18 engine, every email is double-opt-in or transactional, and rerunning any job changes nothing.

## Schema & API changes
Migration `00XX_loyalty_retention`. New tables: `job_runs`, `points_ledger`, `rewards`, `charities`, `donations`, `referral_codes`, `referrals`, `newsletter_subscribers`, `stock_alerts`, `pet_messages`, `wishlists`, `wishlist_items`. Columns: `orders.donation_cents` (total check extended).
Endpoints: `POST /internal/jobs/run` (secret header); `GET /me/points` (user); `GET /rewards` (public), `POST /me/rewards/:id/redeem` (user); `POST /me/points/donate` (user); `GET /charity/total` (public); `GET /me/referral` (user); `POST /newsletter/subscribe`, `POST /newsletter/confirm`, `POST /newsletter/unsubscribe` (public, token); `POST /stock-alerts`, `DELETE /stock-alerts/:token` (public); `GET|POST|DELETE /wishlist/items`, `POST /wishlist/share` (cart-style identity); `GET /wishlist/shared/:token` (public); `GET /me/buy-again`, `POST /me/orders/:id/reorder` (user); `/admin/rewards` CRUD, `POST /admin/points/adjust` (admin).

## Touches shared files
`routes.tsx` (account/rewards, wishlist, /w/:token, /charity), Header (wishlist + buy again), Footer (newsletter, charity total), PDP and PLP card (heart, earn points, alerts), checkout page (points, round-up), seed index, schema index, `apps/api/src/index.ts` (in-process runner), CI workflows (cron).
