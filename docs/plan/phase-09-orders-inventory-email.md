# Phase 9 — Orders, inventory rules, email

Goal: order lifecycle as a state machine, customer-facing order history, order emails (local Mailpit).

## Step 9.1 — order state machine
- `modules/orders/state-machine.ts`: allowed transitions map
  (`pending_payment → paid|cancelled`, `paid → processing|refunded|cancelled`, `processing →
  shipped|cancelled`, `shipped → delivered`, `delivered → refunded`). `transition(order, to, actor,
  note)` validates, writes history, applies side effects (cancel from `paid` = refund in Stripe →
  create refund via API; cancel from `pending_payment` = release reservations + cancel intent).
  Pure validation unit-tested exhaustively; side effects integration-tested.
- Learn / explain: explicit state machines vs scattered `if`s.
- Commit: `feat(api): add order state machine`

## Step 9.2 — customer order endpoints
- `GET /account/orders` (paginated), `GET /account/orders/:number` (items, totals, addresses,
  status history visible to customer: paid/shipped/delivered). Guest lookup via the `last_order`
  cookie only (no email+number lookup — explain enumeration risk; could be a stretch with a token).
- Commit: `feat(api): add customer order endpoints`

## Step 9.3 — web: order history + detail
- `/account/orders` list (number, date, status badge, total, items thumbnail strip),
  `/account/orders/:number` detail with timeline. Reuse the confirmation page's `OrderSummary`.
- Commit: `feat(web): add order history pages`

## Step 9.4 — email infrastructure
- `lib/mailer.ts`: `nodemailer` transport from `SMTP_URL` (Mailpit locally; Resend's SMTP endpoint in
  prod with the API key as password, so one code path); templates as plain TS
  functions returning `{ subject, text, html }` (`emails/order-confirmation.ts`,
  `emails/order-shipped.ts`); minimal inline-CSS HTML. `sendMail` logs and never throws into the
  caller (email failure must not fail a webhook).
- A tiny `email_outbox` is **not** built; document the trade-off (fire-and-forget + logs is enough
  for a demo; outbox would be the production answer).
- Commit: `feat(api): add mailer and order email templates`

## Step 9.5 — hook emails into events
- Webhook `paid` → confirmation email; transition to `shipped` → shipped email. Tests assert the
  mailer was called with the right order (mock transport).
- Acceptance: visible in Mailpit at `localhost:8025`.
- Commit: `feat(api): send order confirmation and shipped emails`

## Step 9.6 — inventory invariants test
- Property-style test: random sequence of add-to-cart / checkout / webhook success / cancel across
  several carts for one variant never makes `quantity < 0` or `reserved < 0` or `reserved >
  outstanding pending qty`.
- Commit: `test(api): add inventory invariant test`

Phase 9 done when: a complete order's life (placed → paid → shipped → delivered) is visible to the
customer with emails, and the invariants test is green.
