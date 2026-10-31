# Phase 22 — Post-purchase & operations

Goal: returns, a vet-approval gate and an analytics view, so the store behaves like a business after the sale.

## Learn / explain
- Extending a state machine safely: add states and edges in the single table, then let the exhaustive tests fail until every consumer handles them.
- Modelling a sub-process (RMA) as its own entity with its own states instead of overloading order status.
- Payment gateway abstraction: partial refunds, idempotency keys per return, simulated now and Stripe later.
- Holding stock for an order awaiting a human decision, and releasing it on rejection (reuses reservation logic).
- Analytics in SQL: `date_trunc`, `SUM`, `GROUP BY`, integer cents end to end, CSV streaming and spreadsheet-injection escaping.

## Step 22.1 — gateway: partial refunds
- Extend `PaymentGateway.refundPaymentIntent(id, idempotencyKey, amountCents?)` (today it takes `(id, idempotencyKey)` and refunds in full; this phase is the single owner of the refund interface, others only call the refund service). Stripe adapter passes `amount` when given; `FakeStripe` tracks refunded cents and rejects over-refund. Stripe is not configured now: dev and e2e use the fake (`NODE_ENV=test`); in plain dev the refund call answers 502 as today, so a `RETURNS_SIMULATED=true` env flag makes the service record a simulated refund (`provider_refund_id = sim_...`). Clearly labelled "simulated" in admin UI.
- Tests: partial + remaining refund; over-refund rejected; idempotent replay.
- Commit: `feat(api): support partial refunds in payment gateway`

## Step 22.2 — schema + shared types
- `returns` and `return_items` (below). Order stays `delivered`; no new order status for returns (rejected alternative: `return_requested` order status, which breaks the "delivered -> refunded" edge for partial returns). Order becomes `refunded` only when every line is fully returned and refunded.
- Return states: `requested -> approved | rejected`, `approved -> received`, `received -> refunded`. Own table in `returns/state-machine.ts` with the same test style as orders.
- Commit: `feat(api): add returns schema and state machine`

## Step 22.3 — customer return request
- `POST /orders/:id/returns` (owner only): order must be `delivered`, within a 30-day window (`RETURN_WINDOW_DAYS`), lines/quantities not already in an open or finished return, reason enum (`wrong_size`, `damaged`, `not_as_described`, `changed_mind`, `other`) + optional note. Refund amount computed in integer cents from the line price paid minus `order_items.discount_cents` (phase 18 stores every order-level discount and credit already allocated per line; floor, remainder to the last line); zero-paid lines (gifts) are not returnable; the round-up donation is only reversed on a full refund.
- Tests: not-delivered 409, outside window 409, over-quantity 422, other user's order 404.
- Commit: `feat(api): add customer return requests`

## Step 22.4 — admin return handling + refund + restock
- `POST /admin/returns/:id/approve|reject|receive|refund` (reject needs reason). `receive` restocks selected lines (adds `inventory_adjustments` row, reason `return`, skipped for `damaged`; bundle lines restock their components via the phase 16 expansion helper; for pickup orders, phase 23, restock goes to `store_stock` of `orders.pickup_store_id`). `refund` calls the gateway in a transaction-safe order: write intent row -> call gateway with key `return-<id>` -> mark refunded; shipping not refunded unless admin ticks it.
- If all order lines are fully refunded, apply `delivered -> refunded` via the existing `applyTransition`. Every successful refund emits the phase 14 `onOrderRefunded({orderId, refundedCents, full})` event; phase 19 (points, referral, donation reversal) subscribes, so this phase has no import from phase 19.
- Emails (new templates in `emails/`): requested, approved (with return instructions), rejected, received, refunded.
- Tests: restock only on receive; replay does not double refund; email per step in Mailpit.
- Commit: `feat(api): add admin returns, refund and restock`

## Step 22.5 — web: returns (customer + admin)
- Order detail: "Return items" button when eligible -> `ReturnRequestForm` (line checkboxes, qty, reason), return status timeline on the order. `/admin/returns` list + detail with action buttons showing only allowed next states. `track('return_requested')`. API in `src/api/returns.ts`.
- Commit: `feat(web): add returns request and admin returns screens`

## Step 22.6 — vet-approval: schema + checkout rule
- `products.requires_vet_approval bool` (seed: 4 fictional items, e.g. "Calmwell" calming chews, "Nibblewise Rx-style" dental gel; wording stays fictional, no medical claims, banner "demo, not real medicine"). New order status `awaiting_vet_approval` in the state table: `paid -> awaiting_vet_approval | processing`, `awaiting_vet_approval -> processing | cancelled`. Order gets a vet details record. Stock stays reserved while waiting (decided: reserve, rejected alternative: release and re-check later, which can oversell the customer after they paid).
- Checkout: if the cart has a flagged item, show `VetDetailsForm` (name, clinic, email, all required, Zod validated); API rejects checkout without it. After payment succeeds, the webhook/simulate path routes the order to `awaiting_vet_approval` instead of `processing`.
- Tests: state machine exhaustive test updated; flagged cart without vet details 422; unflagged cart unaffected.
- Commit: `feat(api): hold vet-flagged orders for approval`

## Step 22.7 — vet-approval: admin decision (simulated)
- `/admin/vet-approvals` queue: approve (simulated vet confirmation, logs a fake "confirmation code"; no email to a real vet; the vet email field only shows in admin and the Mailpit mail) -> `processing`. Reject with reason -> `cancelled`, stock released, refund via gateway (full, same simulation rules as 22.1). Customer emails for held, approved, rejected. Order detail shows a "waiting for vet approval" badge. Rejection emits `onOrderCancelled` and `onOrderRefunded` (full). Add `awaiting_vet_approval` to shared `ORDER_STATUS_LABELS` (phase 14). Interaction with phase 23: a pickup order with a flagged item goes `paid -> awaiting_vet_approval -> processing -> ready_for_pickup`.
- Commit: `feat(api,web): add vet approval queue and customer messaging`

## Step 22.8 — admin analytics API
- `GET /admin/analytics?from=&to=&interval=day|week|month`: revenue series (orders where shared `isPaidOrLater` is true, net of refunds), orders count, AOV (`SUM/COUNT` integer division, rounded half up in SQL), top 10 products by units and revenue, low-stock variants (available <= threshold, default 5), returns rate (returned units / delivered units, basis points integer). Range max 366 days; Postgres `date_trunc` in store timezone constant.
- `GET /admin/analytics/export.csv?report=orders|products|low-stock` streamed, amounts in cents plus a formatted column, cells starting with `= + - @` prefixed with `'`.
- Tests: seeded fixtures with known totals; refunds subtract; empty range returns zeros; CSV escaping.
- Commit: `feat(api): add admin analytics and csv export`

## Step 22.9 — web: analytics dashboard
- `/admin/analytics`: date-range presets (7/30/90 days) in URL state, KPI tiles, revenue line chart (hand-rolled SVG, no chart library; **if a library is wanted it needs his OK**), top-products table, low-stock table linking to the product editor, returns-rate tile, CSV buttons. Empty and loading states.
- Commit: `feat(web): add admin analytics dashboard`

## Step 22.10 — seed + e2e
- Seed delivered orders over 90 days (deterministic RNG) so charts are not empty; one sample return.
- e2e `post-purchase.spec.ts`: buy delivered item (test helper marks delivered) -> request return -> admin approves, receives, refunds (simulated) -> stock back, order shows refunded; buy vet item -> held -> admin approves -> processing; analytics page shows non-zero revenue.
- Commit: `test(e2e): add returns, vet approval and analytics flow`

Phase 22 done when: a delivered order can be returned and refunded with restock and emails, a vet-flagged order waits for and obeys an admin decision, and the analytics page reports correct integer-cent figures with CSV export.

## Schema & API changes
Migration `00XX_post_purchase_ops`:
- `returns(id, order_id, user_id, status enum('requested','approved','rejected','received','refunded'), reason, note, reject_reason, refund_cents int, refund_shipping bool, provider_refund_id, simulated bool, created_at, updated_at)`.
- `return_items(id, return_id, order_item_id, quantity, reason, refund_cents)`.
- `order_status` enum + `awaiting_vet_approval`; `products` + `requires_vet_approval bool default false`.
- `order_vet_details(order_id PK, vet_name, clinic, vet_email, decision enum('pending','approved','rejected'), decided_by, decided_at, reason, confirmation_code)`.

Endpoints:
- POST `/orders/:id/returns` auth owner; GET `/orders/:id/returns` auth owner.
- GET `/admin/returns`, GET `/admin/returns/:id`, POST `/admin/returns/:id/approve|reject|receive|refund` admin.
- GET `/admin/vet-approvals`, POST `/admin/vet-approvals/:orderId/approve|reject` admin.
- POST `/checkout` (existing) accepts `vetDetails` when needed.
- GET `/admin/analytics`, GET `/admin/analytics/export.csv` admin.

## Touches shared files
`order_status` enum in `packages/shared` and `state-machine.ts` (+ its tests), `lib/stripe.ts` gateway interface and `test/fake-stripe.ts`, checkout service and page, order detail page, `routes.tsx`, admin side nav, seed index, schema index, `emails/index.ts`, `.env.example` (`RETURN_WINDOW_DAYS`, `RETURNS_SIMULATED`).

## Needs his OK
Only if a chart library is preferred over hand-rolled SVG.
