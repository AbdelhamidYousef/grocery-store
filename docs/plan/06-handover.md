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
- **G6 in progress** (weight and expiry): G6.1 done: stock batches with best-before dates, first expired first
  out, `write-off-expired` job, food returns written off (migration 0051; `modules/stock/batches.ts` is the only
  writer; `expectBatchInvariant()` in `test/stock.ts` guards sum(batches) = `inventory.quantity`). G6.2 done: best-before
  on the PDP and the 30 % short-dated offer (migration 0052; `stock/short-dated.ts` counts it; shelf on home and
  department pages; one cart line per variant).
- **Open follow-ups** (small, not blocking):
  - Reseed before the first public deploy: a database migrated from G3 has identical shelves in every store (`pnpm db:reset`).
  - e2e "back in stock" fails under full-suite load (it waits for a mail through two `pnpm` spawns) and passes alone; give it a longer timeout or call the job in-process.
  - The `release-slot-holds` cadence is 5 minutes: a scheduler that calls `POST /internal/jobs/run` hourly only runs it hourly, which is harmless (holds expire by themselves).
  - Express availability and slot status depend on the time of day (Berlin), so a spec must never assert "express is on".

## Waiting on you

- Nothing yet.
