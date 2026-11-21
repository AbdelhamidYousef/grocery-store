# Phase G4: Areas and dark stores

Goal: the shop knows where it delivers. A postcode maps to a delivery area, each area is served by
one dark store (a small warehouse that only ships, no walk-in shoppers), and stock is held per store,
so what you can buy depends on your postcode. The shopper sets the postcode once (home hero or a
header chip) and sees "We deliver to 10115 · Mitte" across the shop.

## Learn / explain
- **Why stock moves from "per variant" to "per variant × store".** One warehouse means one number.
  Four dark stores mean four numbers for the same yoghurt, and the one that matters is the store
  that will pack your bag. Every read of availability now needs a store, and the code has to get it
  from somewhere: here, from the shopper's postcode.
- **Where the postcode lives.** The shopper's choice is client state: `?postcode=10115` in the URL
  sets it (so a shared link shows the same shop), the web keeps it in local storage and sends
  `X-Postcode` on every API call, the same way it already sends `X-Store-View`. The server never
  trusts it for money or stock moves: checkout uses the postcode of the **delivery address**, which
  is where the bag actually goes.
- **No postcode yet.** The shop still browses. Availability shows the central store (Mitte) and the
  header asks for a postcode. Checkout always needs a served address postcode.

## Data model (migration 0046, plus seed)
- `delivery_areas`: `id`, `slug` (unique), `name` (text; German name in translations is not needed,
  area names are Berlin district names), `active` boolean, timestamps.
- `dark_stores`: `id`, `slug` (unique), `name`, `street`, `postal_code`, `area_id` (FK, unique: one
  store per area), `active`, timestamps.
- `postcodes`: `code` char(5) PK, `area_id` FK. Seeded, never edited in the UI.
- `inventory`: add `store_id` (FK dark_stores, cascade), PK becomes (`store_id`, `variant_id`). The
  migration adds the column, creates the stores, copies every existing row to each store (add,
  backfill, drop the old PK in one migration), then the seed sets varied quantities.
- `inventory_adjustments`: add `store_id` (not null after backfill).
- `orders`: add `dark_store_id` (nullable for old orders; set on every new order). Reservations
  are placed, released and confirmed against it.
- `stock_alerts`: add `store_id` (nullable; the store of the postcode at subscribe time, null =
  any store).
- Seed: four areas and stores (Mitte, Prenzlauer Berg, Kreuzberg-Friedrichshain, Neukölln), about
  30 real Berlin postcodes split between them. Stock per store from a seeded deterministic spread, so
  some products are out in one store and in stock in another (the demo must show it).

## Step G4.1: follow-ups from G3
- Order numbers: `GR-2026-000123` instead of `PW-` (migration on the generated column default;
  existing orders keep their number). Update e2e and tests that match `PW-`.
- Reviews: drop the unused `reviews.size` column and the "Size you bought" field (shared schema,
  form, API, translations, tests).
- Commit: `fix(orders): GR- order numbers; drop the review size field`

## Step G4.2: areas, stores and postcodes (API)
- Schema + migration + seed above (without the inventory change yet). Shared `postcodeSchema`
  (`/^\d{5}$/`) and types in `packages/shared/src/areas.ts`.
- `GET /api/delivery/postcodes/:code` → `{ postcode, served: true, area: {slug,name}, store:
  {slug,name} }` or `{ postcode, served: false }` (404 only for a malformed code → 400).
- `GET /api/delivery/areas` → areas with their store and postcodes (for the delivery info page).
- Middleware `deliveryContext` (next to the store-view context in `modules/i18n/context.ts`):
  reads `X-Postcode`, resolves `{ postcode, area, store, served }`, falls back to the default store
  (Mitte) when missing or not served. Cached lookup (the table is tiny; load once per process, reset
  in tests).
- Learn: a lookup table beats a rule ("10xxx is Mitte") because real areas are not ranges.
- Commit: `feat(delivery): postcodes, areas and dark stores`

## Step G4.3: stock per dark store
- `inventory` gets `store_id` (migration as above). `db/available.ts` helpers take the store:
  `stockQuantity(variantId, storeId)` / `stockReserved(...)`, and every caller LEFT JOINs
  `inventory` on `variant_id = … and store_id = <store>`. Callers take the store from
  `deliveryContext` (catalogue, search, cart, wishlist, reorder, recommendations, bundles, promotions,
  stock alerts).
- Checkout: the delivery address postcode must be served (`422 POSTCODE_NOT_SERVED`, message says
  which areas we cover); reserve, release, confirm and restock against that store; `orders.dark_store_id`
  is set. The release-stale-reservations job and the order state machine use `orders.dark_store_id`.
  Returns restock to the order's store.
- Admin: the product stock editor shows one row per store (quantity, reserved, low-stock threshold);
  adjustments record the store; low-stock stats per store.
- Stock alerts: store the subscriber's store; the back-in-stock job checks that store (or any).
- Test fixtures move to served Berlin postcodes (`10115` etc.) where they check out.
- Learn: why the store comes from the delivery address at checkout, not from the header.
- Risky (lead reviews the diff): reservations per store, the migration's backfill, bundles.
- Commit: `feat(inventory): stock per dark store`

## Step G4.4: postcode gate in the web
- `DeliveryContext` (web): reads `?postcode=` (URL wins, then local storage), validates via the
  API, exposes `{postcode, served, area, store, setPostcode, clear}`; the API client sends
  `X-Postcode`. Changing the postcode refetches catalogue queries (query keys include it).
- Home hero postcode box (already writes `?postcode=`) shows the result: "We deliver to 10115 ·
  Mitte" or "We don't deliver to 12345 yet" with the list of areas.
- Header chip: "Deliver to 10115" / "Enter postcode", opens a small dialog with the same form.
- PDP and PLP availability follow the store; out of stock "at your store" says so.
- Checkout: address postcode prefilled from the gate; a not-served error shows inline on the field.
- `/delivery` info page: areas, their stores and postcodes (from `GET /api/delivery/areas`).
- English and German strings, tone per `03-conventions.md`.
- Commit: `feat(web): postcode gate and delivery areas`

## Step G4.5: phase end
- Gates + e2e (one new spec: enter postcode → the chip shows the area → a product out of stock in
  Mitte is in stock in Neukölln → checkout to a Neukölln address reserves there). Journal, quiz,
  handover, push. Commit: `docs(plan): phase G4 done`
