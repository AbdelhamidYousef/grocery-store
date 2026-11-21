# Plan 06: Handover

Written by the build sessions for the owner and the next session. Newest state first.

## Current state

- **G0 done** (2026-11-14): own ports (Pawsome's + 1), compose project and databases `grocery`;
  all gates green: shared 338, web 969, API 1,461 + 2 skipped, e2e 79 + 1 skipped.
- The API suite went from ~45 to ~8 minutes: local Postgres runs without fsync (see the G0 journal).
  The same fix likely cures Pawsome's "full API suite hangs" issue (its compose file needs the same
  `command:` line); not applied there, since Pawsome's plan is read-only from here.
- **G1 done** (2026-11-14): gift finder, feeding calculator, pet gallery, vet gate, pet profiles and
  messages, and size guides are gone (migrations 0038 to 0042, six local commits, not pushed). Gates
  green: shared 259, web 896, API 1,378 + 2 skipped, e2e 74 + 1 skipped. Next: G2, then push at the
  phase end as approved. The pet axis (species, mega-menu, newsletter pet interests) stays until G3.
- **G2 done** (2026-11-14): two store views (`de-en`, `de-de`, EUR, Germany only; migration 0043),
  green palette and Plus Jakarta Sans, bag-and-leaf `Logo`, favicon and manifest, Pawsome renamed in the
  shell and emails, tone of voice in `docs/plan/03-conventions.md`. Gates green: shared 260, web 900,
  API 1,361 + 2 skipped, e2e 75 + 1 skipped (re-run after the en-IE and du follow-ups). Still Pawsome: the house brand in the seed (brands, German
  translation, "Made in" spec), and pet-themed home content: all G3. German UI and emails use "du"; seed
  product and guide texts still say "Sie" (G3). Local DB was reset (`pnpm db:reset`) to pick up `@grocery.test` accounts. Not pushed.

- **G3 done** (2026-11-21): ten departments replace the pet axis; nutrition, ingredients, the 14 EU
  allergens and dietary filters; 120 grocery products from `catalogue.json`, all with generated
  photos; the quick-commerce home. QA fixes on the way: the German menu and tile counts (translated
  slugs), the department bar overflow, the free-sample picker labels, leftover pet copy. Gates green:
  shared 270, web 923, API 1,378 + 2 skipped, e2e 75 + 1 skipped. Pushed at the phase end.
- **G4 done** (2026-11-21): order numbers `GR-` (migration 0046); areas, dark stores, postcodes and the
  `X-Postcode` delivery context (migration 0047, `/api/v1/delivery/*`); stock per dark store (migration
  0048, reservations at the delivery address's store, admin stock editor per store); the web postcode
  gate (`DeliveryProvider`, header chip + dialog, hero result, `/delivery` page, store-aware "Sold out at
  ...", checkout postcode check; EN + DE). Checkout needs a served Berlin postcode (422 otherwise). New
  e2e spec `delivery-areas.spec.ts`. Gates green: shared 282, web 950, API 1,416 + 2 skipped, e2e 76 + 1 skipped.
  A database migrated from G3 needs `pnpm db:reset` to get varied shelves. Not pushed yet.
- **G5 done** (2026-11-21): delivery slots. One-hour slots per dark store (`delivery_slots`, generated 7 days
  ahead by the daily `generate-slots` job and the seed), express within 30 minutes, holds of 15 minutes that
  count against capacity under a slot-row lock (`modules/delivery/holds.ts`; expire by `expires_at` alone, the
  5-minute `release-slot-holds` job only deletes old rows), checkout needs a live hold or express (new codes
  `SLOT_FULL`, `SLOT_CLOSED`, `SLOT_WRONG_AREA`, `SLOT_HOLD_EXPIRED`, `EXPRESS_UNAVAILABLE`, `DELIVERY_REQUIRED`),
  migrations 0049 and 0050, shipping methods `slot` (2.99 EUR, free over 49) and `express` (4.99 EUR) with the
  parcel `standard` switched off. Web: the "Delivery time" checkout step with hold countdown, "Next delivery" on
  the product page and cart, the window on the confirmation, account order, tracking page and both order emails.
  The Pawsome cutoff estimate (`shared/delivery.ts`, `GET /delivery-methods`) is deleted. Gates green: shared 277,
  web 959, API 1,453 + 2 skipped, e2e 77 + 1 skipped (the known "back in stock" flake fails under full-suite load
  and passes alone). A database migrated from G4 needs `pnpm db:migrate && pnpm db:seed` for slots and fees. Not pushed.
  Tests that check out through the API use `makeShopper(...).pickSlot()` / the auto-pick before `POST /checkout`
  (`autoSlot: false` for the delivery rule tests); e2e uses `pickSlot` in `e2e/helpers.ts`.
- **G6 done** (2026-11-21): weight and expiry. Stock batches with best-before dates and first-expired-first-out
  (migration 0051; `modules/stock/batches.ts` is the only writer, `expectBatchInvariant()` in `test/stock.ts` guards
  sum(batches) = `inventory.quantity`; food returns are written off, the daily `write-off-expired` job clears
  expired packs); best-before on the product page and the 30 % short-dated offer (migration 0052; counted in
  `stock/short-dated.ts`, one cart line per variant, "Short-dated deals" shelf on home and department pages);
  items sold by weight (migration 0053; `shared/weight.ts` owns every weighed-money rule); manual capture
  (migration 0054): checkout authorises total + 15 % of the weighed lines, the `requires_capture` webhook secures
  the order, `checkout/capture.ts` has `capturePayment` (422 above the hold, key `capture:<order>`, recorded once),
  `finalizeOrder` and the hourly `capture-overdue`, admin "Capture now", cancelling an authorised order cancels the
  intent, `payments.capture_method` keeps the automatic path for old orders; slots go 6 days ahead. The flaky e2e
  "back in stock" spec is fixed (the job runs in the API through `POST /internal/jobs/run` with `force`, which is
  refused in production). Gates green: shared 291, web 988, API 1,520 + 3 skipped, e2e 78 + 1 skipped. A database
  migrated from G5 needs `pnpm db:migrate && pnpm db:seed` (batches, weighed variants). Not pushed.
- **G7.1 done** (2026-11-21, G7 in progress): substitution preference per line. Migration 0055 (`substitution`,
  `substitute_variant_id` on cart and order lines, `users.default_substitution`, the `pick_status` / `swap_status`
  enums for G7.2). Shared `substitutions.ts` has the pure `bestMatches` (safe before similar), API
  `GET /products/:slug/substitutes`, cart `PUT /cart/items/:id/substitution` and `PUT /cart/substitution`, account
  `GET/PUT /account/substitution`; web: select on each cart line, pick dialog, "same for every item", account default.
- **G7.2 done** (2026-11-21): swaps, approval and money, API only. Migration 0056 (pick/swap columns, refund fields on
  `order_items`). `modules/substitutions/swaps.ts` (`recordShortfall`, `decideSwap`, `acceptUnanswered`), `door.ts`
  (`rejectAtDoor`), `lib/signed-token.ts`, `stock/batches.ts` (`allocateLineStock`, `trimLineRecords`, `heldUnits`),
  `finalAmountCents` per line, email `order_swaps`, admin `POST /admin/orders/:number/items/:itemId/shortfall` and
  `.../swaps/:itemId/reject-at-door`, shopper `POST /orders/:number/swaps/:itemId`.
- **G7.3 done** (2026-11-21): the shopper's view. Migration 0057 (`list_price_cents` on a replacement). Account order
  page "Changes to your order" (gap, replacement with photo, "You save", Accept / Reject until the bag is closed, then
  the outcome; missing items say "not charged"), order summary lines for replacements and short lines, the email-link page
  `/:store/order-changes/:number` (a button, never a GET that acts), read-only changes on the tracking page. EN + DE.
- **G7 done** (2026-11-21): substitutions. Per-line "if it is missing" (best match / choose a product / refund it, account
  default, "same for every item"), the pure shared `bestMatches` (safe before similar), swaps recorded by the packer with
  the stock taken FEFO at the order's store, accept / reject before dispatch (unanswered counts as accepted), the capture
  from picked units and accepted swaps, door rejection refunded line by line, the email with signed links, the shopper's
  view in EN + DE. Migrations 0055 to 0057. New e2e spec `substitutions.spec.ts`. Gates green: shared 309, web 1,007, API
  1,569 + 3 skipped, e2e 79 + 1 skipped. A database migrated from G6 needs `pnpm db:migrate`. Not pushed (the lead pushes at
  the phase end). Open: an order whose every line is missing and has free shipping cannot be captured (the capture refuses 0:
  cancel it). (The shortfall screen, the loyalty claw-back and the net revenue were closed in G8.)
- **G8.1 done** (2026-11-21, G8 in progress): the packer view. Migration 0058 (`aisles`, order dispatch columns,
  `order_items.packed_grams`), seeded layout per store (`db/seed/aisles.ts`), `modules/picking` (pure `pick-list.ts`,
  `GET /admin/stores/:slug/picking`, `POST .../items/:itemId/pick`, `GET .../substitutes`), web `/admin/picking`. A database
  migrated from G7 needs `pnpm db:migrate && pnpm db:seed` (aisles).
- **G8.2 done** (2026-11-21): pack, capture and dispatch. `modules/picking/dispatch.ts` (`packOrder`, `dispatchOrder`,
  `deliverSimulated`), `POST /admin/orders/:number/pack` and `/dispatch`, job `deliver-simulated` (5 minutes), shared
  `riderProgress`, email `order_delivered` and a reworded `order_shipped` (rider, window, EN + DE), order DTO `packedAt` and
  `dispatch`, write-off row `not_found_at_pick`. G7 open items closed: analytics net revenue reads captured, door refusals
  claw back loyalty points. Still open: the admin "mark shipped" button (`/transition`) bypasses pack and capture (old
  `capture-overdue` and "Capture now" remain the safety net).
- **G8.3 done** (2026-11-21): the tracking page. `fulfilment` on the tracking answer, the four grocery steps, the rider
  card (name, progress bar, "about N minutes away", "the rider is simulated"), polling every 30 seconds while on the way,
  EN + DE; `paid` shows as "Order received" and `shipped` as "On the way".
- **G8 done** (2026-11-21): picking and dispatch. Per dark store a packer view (`/admin/picking`: the orders due in 2 hours
  or all, the pick list in walking order ambient, chilled, frozen by aisle with the packs to take and the bag each unit goes to,
  one panel per bag, "Find an order"), aisles per store (seeded layouts), grams kept until dispatch, shortfalls with a safe
  replacement, "Bag packed" (every line resolved, the units not found recorded as `not_found_at_pick`), "Hand to rider"
  (captures once with the packed grams, rider, `shipped`, email), the `deliver-simulated` job, shared `riderProgress`, the
  tracking page with four grocery steps and a simulated rider (polls every 30 s), `order_delivered` mail. Migration 0058. Also
  closed: analytics net revenue reads captured, door refusals claw back loyalty points. New e2e spec
  `picking-dispatch.spec.ts`. Gates green: shared 315, web 1,023, API 1,620 + 3 skipped, e2e 80 + 1 skipped. A database migrated
  from G7 needs `pnpm db:migrate && pnpm db:seed` (aisles). Not pushed (the lead pushes at the phase end). Open: the admin's
  "mark shipped" button still bypasses pack and capture; the e2e and a packer need `Find an order` because the list is cut at
  30 bags; admin product forms still cannot create weighed variants.
- **G9.1 done** (2026-11-21, G9 in progress): basket rules. Shared `basket-rules.ts` (`BASKET_RULES`, `basketTotals`, `billOf`,
  `isPeakSlot`, `isOuterArea`), `priceCart` got `feesCents`, `shipping.neverFree` and `goodsCents`; migration 0059 (deposit per
  variant, `carts.bags`, order `deposit_cents` / `bag_fee_cents` / `delivery_fee_cents`, `order_items.deposit_cents`, widened total
  check); `PUT /cart/bags`; checkout refuses goods under 15.00 with 422 `BELOW_MINIMUM_ORDER`; `finalAmountCents` drops the deposit
  of units not found; cart, checkout, order pages, admin order and emails show deposit, bags and delivery (EN + DE); `/delivery`
  states the rules; admin variant form has "Bottle deposit". Shipping methods are only a delivery kind now (their price columns are
  unused). The test shopper tops a short basket up with a filler line (see the journal). A database migrated from G8 needs
  `pnpm db:migrate && pnpm db:seed` (deposit on the seven drinks). Not pushed.

  Paid orders are only AUTHORISED until captured: tests that refund or return a paid order capture it first
  (`captureOrder` / `deliveredOrder` in `test/orders.ts`); `simulate` turns "the shopper paid" into the
  authorisation event for a manual-capture order.
- **Open follow-ups** (small, not blocking):
  - (Closed before G9.1) The admin status button refuses "shipped" for a manual-capture order and points to the packer view; admin variant forms create and edit weighed variants (price per kg and nominal grams; the unit price is derived).
  - The admin "Capture now" and the overdue job stay as a safety net beside dispatch (which captures with the packed grams).
  - The e2e API now needs a `JOBS_SECRET` (set by `playwright.config.ts`); a hand-started e2e server without it makes the back-in-stock spec fail with 404.
  - Reseed before the first public deploy: a database migrated from G3 has identical shelves in every store (`pnpm db:reset`).
  - The `release-slot-holds` cadence is 5 minutes: a scheduler that calls `POST /internal/jobs/run` hourly only runs it hourly, which is harmless (holds expire by themselves).
  - Express availability and slot status depend on the time of day (Berlin), so a spec must never assert "express is on".

## Waiting on you

- Nothing yet.
