# Phase 8 — Checkout and Stripe (test mode)

Goal: a complete, honest checkout: address → shipping → payment (Stripe Payment Element) →
webhook-confirmed order → confirmation page. Amount integrity, idempotency, and stock reservation
done properly.

Prereqs: Stripe account in **test mode** (free; ask before creating), `stripe` CLI logged in,
`STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_PUBLISHABLE_KEY` (`pk_test_…`), `STRIPE_WEBHOOK_SECRET`
(from `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`). All in `.env.example`
with comments; never `sk_live_`.

## Step 8.1 — shipping quotes
- `modules/checkout/shipping.ts`: `quote(methods, { country, weightGrams, subtotalCents })` →
  `price = base + ceil(weight/1000) * perKg`, 0 if `subtotal ≥ freeOver`. Pure, unit tested. Route
  `GET /checkout/shipping-methods?country=`.
- Commit: `feat(api): add shipping quotes`

## Step 8.2 — shared checkout schemas
- `AddressSchema` (country ISO2 from a small allow-list constant, postal code non-empty),
  `CheckoutRequestSchema`, `CheckoutResponseSchema`, `OrderSchema`, `OrderStatusSchema`.
- Commit: `feat(shared): add checkout and order schemas`

## Step 8.3 — Stripe client wrapper
- `lib/stripe.ts`: single `Stripe` instance (`apiVersion` pinned), `createOrUpdatePaymentIntent({
  amount, currency, orderId, orderNumber, email, existingId? })` with an **idempotency key**
  `order:<orderId>:v<n>`, `retrievePaymentIntent`, `constructWebhookEvent(rawBody, sig)`.
- Learn / explain: idempotency keys; API version pinning; what a PaymentIntent is vs a Charge.
- Commit: `feat(api): add stripe client wrapper`

## Step 8.4 — place order (the core transaction)
- `checkoutService.placeOrder(cartId, input, user?)` in one DB transaction:
  1. Load cart `FOR UPDATE`; reject empty.
  2. Reprice; reject any `OUT_OF_STOCK`/`VARIANT_UNAVAILABLE` with `CART_CHANGED` 409 (UI reloads cart).
  3. Lock inventory rows `FOR UPDATE` (ordered by id to avoid deadlocks); for each line check
     `available ≥ qty`; increment `reserved`.
  4. If this cart already has a `pending_payment` order → reuse it: replace its items, release the
     previous reservations first (so changing quantity before paying is safe). Else create order
     (`number` from sequence), items (snapshots), totals (`tax_cents` = 0 with a comment that tax is
     out of scope; column kept for realism).
  5. Commit. **Then** (outside the transaction) create/update the PaymentIntent for `total_cents`;
     store `payments` row (`requires_payment`). If Stripe fails: mark order `cancelled`, release
     reservations, rethrow 502. (Explain why Stripe call is outside the DB transaction: no external
     calls while holding locks.)
  6. Return `{ orderNumber, clientSecret, totals }`.
- Mark cart `converted` only when payment succeeds (phase 8.6), so a user who abandons payment still
  has their cart.
- Tests: happy path; concurrent checkouts for the last unit (one wins, one gets 409); reuse of the
  pending order; Stripe failure rollback (mock the wrapper here only).
- Learn / explain: reservations vs decrement-on-pay; lock ordering; the outbox problem (we accept a
  tiny window and handle it by reconciliation in 8.7).
- Commit: `feat(api): add place order with stock reservation and payment intent`

## Step 8.5 — webhook endpoint
- Route mounted **before** `express.json()` with `express.raw({ type: 'application/json' })`;
  verify signature; insert into `webhook_events` (`ON CONFLICT DO NOTHING` → if conflict, respond 200
  immediately: already seen). Then dispatch by type inside a transaction:
  - `payment_intent.succeeded`: load payment by intent id `FOR UPDATE`; verify `amount_received ==
    order.total_cents` and currency (if not: log alarm, set order `pending_payment` with a note, do
    not mark paid); set payment `succeeded`, order `paid` + `placed_at`, **convert reservations to
    decrements** (`quantity -= qty; reserved -= qty`), cart `converted`, history row, enqueue email
    (phase 9).
  - `payment_intent.payment_failed`: payment `failed` + `last_error`; order stays `pending_payment`
    (customer can retry with the same intent).
  - `payment_intent.canceled`: order `cancelled`, release reservations.
  - `charge.refunded`: payment/order `refunded` (admin-driven in Stripe dashboard).
  Mark `processed_at`; on error store `error` and return 500 so Stripe retries.
- Tests: signed fixture events built with `stripe.webhooks.generateTestHeaderString`; duplicate
  delivery; amount mismatch.
- Learn / explain: why raw body; why 200 fast and idempotent; retries.
- Commit: `feat(api): add stripe webhook handler`

## Step 8.6 — order status polling + account/guest lookup
- `GET /checkout/orders/:number/status` → `{ status, paymentStatus }`; allowed for the order's user,
  or for guests when the `cart_id`/order cookie matches (set a short-lived signed `last_order` cookie
  at place-order time). Guest order detail page uses the same cookie.
- Commit: `feat(api): add order status endpoint for confirmation page`

## Step 8.7 — reservation expiry + reconciliation job
- `jobs/release-stale-reservations.ts`: every 5 min (`setInterval` in the API process, guarded so only
  one instance runs — document that a real deployment would use a scheduler), find
  `pending_payment` orders older than 30 min, retrieve their PaymentIntent: if `succeeded` → process as
  if webhook (shared handler), else cancel the intent, cancel the order, release reservations.
- Learn / explain: why a reconciler is the safety net for lost webhooks.
- Commit: `feat(api): add stale reservation release job`

## Step 8.8 — web: checkout page (steps)
- `/checkout` (guest allowed): one page, three sections with progressive disclosure:
  1. Contact + shipping address (prefill from default address when logged in; "save to my
     addresses" checkbox for users; guest sees "have an account? sign in").
  2. Shipping method radio list (quotes fetched when country known).
  3. Payment: on "Continue to payment" → `POST /checkout` → mount Stripe `Elements` with
     `clientSecret` and the `PaymentElement`; "Pay €X" button → `stripe.confirmPayment({ redirect:
     'if_required', return_url: /checkout/confirmation/<number> })`; handle card errors inline.
  Order summary sidebar (sticky) from the cart; totals from the server response, never computed on
  the client. `track('begin_checkout')`, `track('add_payment_info')`.
- Deps: `@stripe/stripe-js`, `@stripe/react-stripe-js`. Publishable key via `VITE_STRIPE_PUBLISHABLE_KEY`.
- Commit: `feat(web): add checkout page with stripe payment element`

## Step 8.9 — web: confirmation page
- `/checkout/confirmation/:number`: polls status every 2 s up to 30 s; states: "Confirming payment…"
  → "Thank you, order PW-… is paid" with the items and totals (from order detail endpoint) → or
  "We're still confirming; you'll get an email" after timeout. Clears cart query. `track('purchase')`
  once (guard with session storage).
- Commit: `feat(web): add order confirmation page`

## Step 8.10 — e2e payment flow
- Playwright: full flow with `4242…`; a declined card `4000 0000 0000 0002` shows the inline error
  and order stays pending; 3DS card `4000 0025 0000 3155` completes the challenge in the Stripe
  iframe. Locally with `stripe listen`; in CI with the simulate endpoint (phase 11).
- Commit: `test(e2e): add checkout and payment flows`

Phase 8 done when: he can draw the sequence diagram (web → api → stripe → webhook → api → web) from
memory, and explain why the amount comes from the server and why the order waits for the webhook.
