# Phase G6: Weight and expiry

Goal: food behaves like food. Stock arrives in batches with a best-before date and leaves oldest
first; expired batches are written off by a job; short-dated stock is cheaper; loose items (bananas,
cheese from the counter, salmon) are sold by weight, so the card is **authorised** for an estimate at
checkout and **captured** for the weighed amount after packing (Stripe manual capture).

## Learn / explain
- **Batches and FEFO.** "First expired, first out": the store sends the packs that expire soonest,
  so less is thrown away. `inventory.quantity` stays the number every availability query reads; the
  batches say *which* packs those are. Invariant, checked in tests: for every stock row, the sum of
  its batches equals `inventory.quantity`. Every write that changes one changes the other in the
  same transaction.
- **Why food returns are not restocked.** A yoghurt that left the cold chain cannot be sold again.
  Returns of food are refunded and written off; household goods go back on the shelf.
- **Authorise now, capture later.** With `capture_method: 'manual'` Stripe holds the money on the
  card without taking it. After packing we capture the real amount, which may be lower (never higher)
  than what was held. So weighed lines are authorised with a 15 % buffer. A hold lasts 7 days at
  Stripe, which is why slots go only 6 days ahead after this phase.
- **Rounding once.** A weighed line costs `round(price per kg × grams / 1000)` cents, rounded once
  per line (half up), never per gram, the same rule everywhere (shared helper with tests).

## Data model (next migrations)
- `stock_batches`: `id`, `store_id`, `variant_id` (FK inventory pair), `best_before` date (null = does not
  expire, sorted last), `quantity` int ≥ 0, `received_at`; index (`store_id`, `variant_id`,
  `best_before`).
- `order_item_batches`: `order_item_id`, `batch_id`, `quantity`, `short_dated` boolean: which packs
  an order line took, so a cancel puts them back into the same batches and the picker knows what to
  pick.
- `product_variants`: `sold_by_weight` boolean, `price_per_kg_cents` (null unless weighed),
  `nominal_grams` (the "about 500 g" a unit means). For weighed variants `price_cents` is the estimate
  of one nominal unit (derived, not typed twice).
- `products`: `shelf_life_days` (from `catalogue.json`; null for non-food).
- `order_items`: `weighed_grams` (null until packed), `final_cents` (null until packed).
- `orders`: `authorized_cents`, `captured_cents` (null until captured).
- `payment_status`: add `authorized`.

## Step G6.1: batches and first-expired-first-out (API, risky)
- Migration + seed: every stock row gets batches (one to three, dates from `shelfLifeDays`, a few
  within two days of their date so the demo shows short-dated stock, a few already expired so the
  job has work).
- Confirming payment takes units from the oldest batches first and records `order_item_batches`;
  cancelling or releasing gives them back to the same batches. Admin stock increases create a batch
  (best-before = today + shelf life, editable); decreases take oldest first. Food returns are not
  restocked (an `inventory_adjustments` row with reason `written_off_return`).
- Job `write-off-expired` (daily, store zone): batches past their date go to 0, `inventory.quantity`
  drops by the same amount, an adjustment row with reason `expired` records it.
- Tests: FEFO order, the sum invariant after every write path, cancel restores the same batches,
  expiry job, food return not restocked.
- Commit: `feat(inventory): batches with best-before, first expired first out`

## Step G6.2: best-before and short-dated prices
- PDP: "Best before at least 25 Nov" (the oldest date the store could send). Non-food shows nothing.
- Short-dated: units in batches within 2 days of their date are sold at 30 % off. The PDP shows a
  "Short date" offer next to the normal one when the store has such units ("3 packs, best before
  23 Nov, 30 % off"); the shopper chooses it, the cart line carries `short_dated: true`, and its
  allocation comes only from those batches. The reservation stays on `inventory.reserved` (one
  number per stock row); short-dated availability is counted, not stored: units in short batches
  minus short-dated units held by pending orders of that store, checked inside the same locked
  reservation transaction. Home and PLP get a "Short-dated deals"
  shelf for the shopper's store. Shared pricing helper (`shortDatedPrice`) with tests.
- Commit: `feat(catalog): best-before dates and short-dated offers`

## Step G6.3: sold by weight
- Seed the weighed products from `catalogue.json` (`soldByWeight`). Shared helpers in
  `packages/shared/src/weight.ts`: `estimateCents(pricePerKg, nominalGrams)`,
  `weighedCents(pricePerKg, grams)`, `authorisationCents(lines)` (weighed lines + 15 %), all integer.
- PDP/PLP/cart: "about 500 g · 3.78 €/kg · est. 1.89 €"; cart and checkout explain "Final price after
  weighing. We hold up to 2.17 € on your card and take only what it weighs."
- Commit: `feat(catalog): items sold by weight`

## Step G6.4: manual capture (API, risky)
- Gateway: `createPaymentIntent` takes `captureMethod: 'manual'`; new `capturePaymentIntent(id,
  amountCents, idempotencyKey)` (amount ≤ authorised, else a 422 before calling Stripe). The fake
  gateway in tests mirrors Stripe: `requires_capture` after confirm, `succeeded` after capture.
- Checkout authorises `authorisationCents`; the webhook treats `payment_intent.amount_capturable_updated`
  (status `requires_capture`) as "payment secured": order → `paid`, payment → `authorized`, stock
  confirmed, confirmation email ("We hold up to X € and charge what your bag weighs").
- `finalizeOrder(orderId)` service: computes the final amount from `final_cents` (weighed lines)
  and the normal lines (short-dated already priced), captures it, stores `captured_cents`, payment →
  `succeeded`, sends the "Your final bill" email. Used by picking in G8; until then an admin "Capture
  now" button on the order page. Job `capture-overdue`: orders authorised more than 5 days ago are
  captured at the estimate (never risk the hold lapsing).
- Refunds after capture keep working (returns); before capture, cancelling an order cancels the
  intent (no refund needed).
- Slots: 6 days ahead instead of 7.
- Tests: authorise amount with buffer, capture lower than authorised, refuse higher, idempotent
  retry, webhook paths, overdue job, cancel before capture.
- Commit: `feat(payments): authorise at checkout, capture the weighed amount`

## Step G6.5: phase end
- Gates + e2e (buy a weighed item and a short-dated item with the test card; the confirmation says
  "held"; admin captures; the account order shows the final bill). Journal, quiz, handover, push.
  Commit: `docs(plan): phase G6 done`
