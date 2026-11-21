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
- **G4 in progress** (2026-11-21): G4.1 done (order numbers `GR-`, review size field dropped; migration
  0046); G4.2 done (areas, dark stores, postcodes, `X-Postcode` delivery context; migration 0047,
  `/api/v1/delivery/*`); G4.3 done (stock per dark store: migration 0048, reservations at the delivery
  address's store, admin stock editor per store). G4.4 done (web postcode gate: `DeliveryProvider`,
  `X-Postcode` on every call, header chip + dialog, hero result, `/delivery` page, store-aware "Sold out
  at ...", checkout postcode check; EN + DE). Checkout needs a served Berlin postcode (422 otherwise). A
  database migrated from G3 needs `pnpm db:reset` to get varied shelves. Gates green after G4.4: shared
  282, web 950, API 1,416 + 2 skipped. e2e not run yet: the specs still use old postcodes, G4.5 ports
  them and adds the new spec. Next G4.5 (phase end, lead). Not pushed.
- **Open follow-ups** (small, not blocking):
  - e2e "back in stock" missed its mail once under full-suite load (passed on re-run).

## Waiting on you

- Nothing yet.
