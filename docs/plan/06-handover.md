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
- **G5 in progress** (2026-11-21): G5.3 done: checkout "Delivery time" step (`DeliveryTimeStep`, hold countdown), `NextDelivery`
  on the PDP and cart, the order window on the confirmation, account order, tracking page and emails; the Pawsome cutoff
  estimate and `GET /delivery-methods` are gone. G5.2 done: holds and capacity (`delivery/holds.ts`), `GET /delivery/slots`, `PUT/DELETE /cart/slot`, `PUT /cart/express`,
  `release-slot-holds` job (new 5-minute cadence), migration 0050; checkout needs a live hold or express (the web picker is G5.3,
  so the UI checkout cannot pay until then). G5.1 done: shared `slots.ts` (Berlin-zone rules and labels), migration 0049
  (`delivery_slots`, store hours/capacity/riders), `generate-slots` job and seed. Not pushed.
- **Open follow-ups** (small, not blocking):
  - Reseed before the first public deploy: a database migrated from G3 has identical shelves in every store (`pnpm db:reset`).
  - e2e "back in stock" missed its mail once under full-suite load (passed on re-run).

## Waiting on you

- Nothing yet.
