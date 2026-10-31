# Phase 23 — Stores & services

Naming: `stores` here are physical shops. They are unrelated to phase 21's store views (languages/currencies), which use `store_view` and `GET /store-views`.

Goal: give the fictional brand a physical side: a store finder, click & collect, and grooming appointments, all without any payment or paid service.

## Learn / explain
- Modelling a second stock pool without breaking the first: per-store stock next to online stock, and why they stay separate.
- A "shipping option" that is not shipping: pickup as a method kind, with the store attached to the order.
- Slot availability: generating bookable slots from opening hours + service duration, and preventing double booking with a unique constraint and a transaction (no overlap logic in the client).
- Distance with the haversine formula on a small seeded city/postcode table (no geocoding API), and where that approximation is wrong.
- Map tiles: how OpenStreetMap tiles are served and what its usage policy asks.
- Payments: none at booking (pay in store); click & collect is paid online through the existing gateway, which today is the `FakeStripe` / `POST /test/webhooks/simulate` path since Stripe is not configured.

## Step 23.1 — stores data + API
- Tables `stores` (name, slug, address, city, postcode, country, lat/lng as `numeric(9,6)`, phone, services flags) and `store_hours` (store_id, weekday 0-6, opens, closes, null = closed) plus `store_closures` (date, reason). Seed 7 fictional stores in made-up streets of real cities (opening hours differ; one closed Sundays).
- `GET /stores?near=<city or postcode>`: resolves `near` in `geo_places` (seeded ~60 European cities + sample postcode prefixes with coordinates), sorts by haversine km (integer km rounded in SQL or service, no money involved), 404-style `{ resolved: false }` when unknown so the UI can say so. `GET /stores/:slug` includes `openNow` computed in the store's timezone (column `timezone`).
- Tests: haversine known pair within 1 km; unknown place resolves false; openNow respects closures and timezone.
- Commit: `feat(api): add stores and store finder search`

## Step 23.2 — store finder UI
- `/stores`: search box (URL state `?near=`), list + map side by side (stacked on mobile), per-store card with hours table and today's hours highlighted, distance, "Make this my store" (stored in `localStorage`, `track()`).
- Map: **needs his OK** Leaflet (`leaflet` only, no React wrapper) with OpenStreetMap tiles. Tile policy: show the "© OpenStreetMap contributors" attribution, use the standard tile URL, no bulk/prefetching, sensible `maxZoom`; fine for a low-traffic demo, and a note in the README says a tile provider would be needed at scale. The list is fully usable if tiles fail to load (map is enhancement). Rejected: Google Maps (key and billing), static images.
- Tests: Vitest for distance formatting; e2e covered later.
- Commit: `feat(web): add store finder with map`

## Step 23.3 — store stock (click & collect inventory)
- Table `store_stock` `(store_id, variant_id, quantity, reserved)`, check `quantity >= 0`, `reserved <= quantity`. Online `inventory` stays the single source for delivery orders and is never touched by pickup orders; a pickup order draws only from `store_stock`. Rejected: a slice of online stock (two counters to reconcile on every order and a risk of overselling online).
- Admin: set per-store stock with a reason, recorded in `inventory_adjustments` (adds nullable `store_id`).
- `GET /products/:slug/store-availability?variants=` returns per-store `in_stock | low | out`, never exact counts. PDP shows "Pick up in 2 hours at <My store>" when available.
- Tests: reservation concurrent with another stays within quantity; delivery order leaves store stock unchanged.
- Commit: `feat(api): add per-store stock`

## Step 23.4 — pickup at checkout
- `shipping_methods` gains `kind` (`delivery|pickup`, default `delivery`); seed one "Click & collect" method priced 0 cents. Quotes endpoint adds a `pickup` entry only when every cart line is available in at least one store.
- Checkout: choosing pickup shows a store picker (stores that can fill the whole cart); the order gets `pickup_store_id`; no address is required for pickup (billing email/phone still are). Total is computed server-side as today; the web never sends prices.
- Order creation reserves `store_stock` in the same transaction as the order; payment confirmation (fake gateway in tests/e2e) converts reserve to decrement; cancellation or payment failure releases it. Reuses phase 9 state machine (phase 22 has already added `awaiting_vet_approval`; the two are independent), adds status `ready_for_pickup` between `processing` and `delivered` (pickup orders only; `picked_up` maps to `delivered`) and the edge `ready_for_pickup -> cancelled` (releases `store_stock`, full refund through phase 22's refund service, emits the phase 14 `onOrderCancelled`/`onOrderRefunded` events). Add its entry to shared `ORDER_STATUS_LABELS`. The pickup quote and order total still come from `priceCart` (phase 18; pickup is a 0-cent method); bundle lines (phase 16) reserve component rows in `store_stock` through the same expansion helper. Store stock reserve/decrement/release subscribe to the order events (phase 14).
- Tests: pickup without full availability rejected; stock released on failed payment; delivery-only cart never offers pickup.
- Commit: `feat: add click and collect checkout`

## Step 23.5 — ready-for-pickup flow
- Admin order screen: for pickup orders the transition buttons are `Mark ready for pickup` and `Mark collected`. Ready transition sends the "ready for pickup" email (store name, address, hours, order number, pickup code of 6 chars, held for 7 days) through the mailer; collected is allowed only with the right code typed by staff.
- Order page and public tracking (phase 20, if merged) show store and status.
- Tests: email in Mailpit with store details; wrong code rejected; non-pickup order cannot take pickup transitions.
- Commit: `feat: add ready for pickup email and collection`

## Step 23.6 — grooming services + availability
- Tables `grooming_services` (name, description, duration_minutes, price_cents, pet_type), `store_services` (store_id, service_id), `grooming_bookings` (see Schema). Seed 6 services (e.g. "Bath & brush" 45 min 3500 cents, "Full groom" 90 min 6500 cents, nail trim 15 min, ...). Prices are display-only: pay in store.
- `GET /grooming/availability?store=&service=&date=` generates slots every 15 min inside opening hours (and not in closures) where the service fits and fewer than the store's `grooming_stations` bookings overlap, in the store's timezone, not in the past, within 30 days.
- Tests: slot list respects closures; a full day returns none; service longer than remaining time not offered.
- Commit: `feat(api): add grooming services and availability`

## Step 23.7 — booking, cancel, confirmation
- `POST /grooming/bookings` (signed-in), `GET /grooming/bookings` (own), `POST /grooming/bookings/:id/cancel` (own, until 2 hours before start). Booking runs in a transaction that re-checks overlap while holding a `FOR UPDATE` lock on the store's row, so two people cannot take the last station. Pet name and notes are free text, escaped when rendered. Confirmation email with an `.ics` attachment and a cancel link; cancel sends a short email.
- Web: `/grooming` (service cards), `/grooming/book` (store, date, slot picker as radio group with `aria-live` result count), account page "My appointments". Guests are sent to log in with a return URL.
- Tests: double booking the same station 409; cancel after cutoff 409; another user's booking 404; confirmation mail in Mailpit.
- Commit: `feat: add grooming booking and cancellation`

## Step 23.8 — admin screens
- Admin: stores (CRUD, hours editor, closures), store stock grid, grooming services, bookings per store/day (list with cancel), pickup orders filter on the orders screen.
- Commit: `feat(web): add admin stores and grooming management`

## Step 23.9 — e2e
- Search "Hamburg" in the finder, make a store mine, add a cart that is in stock there, check out with Click & collect (fake gateway simulate call), admin marks ready, Mailpit shows the email; then sign in, book a grooming slot, see it in My appointments, cancel it.
- Commit: `test(e2e): add stores, pickup and grooming flows`

Phase 23 done when: a visitor finds the nearest store, buys with click & collect through the simulated gateway, receives a ready-for-pickup email, and a signed-in user books and cancels a grooming slot with no double booking possible.

## Schema & API changes
Migration `00XX_stores_services`.
- New tables: `stores`, `store_hours`, `store_closures`, `geo_places`, `store_stock`, `grooming_services`, `store_services` (+ `grooming_stations` int on `stores`), `grooming_bookings` (store_id, service_id, user_id, station_no, starts_at, ends_at, pet_name, notes, status, unique `(store_id, station_no, starts_at)`).
- New columns: `shipping_methods.kind`, `orders.pickup_store_id`, `orders.pickup_code`, `inventory_adjustments.store_id`, order status `ready_for_pickup`.
- Public endpoints: `GET /stores`, `GET /stores/:slug`, `GET /products/:slug/store-availability`, `GET /grooming/services`, `GET /grooming/availability`.
- Signed-in: `POST /grooming/bookings`, `GET /grooming/bookings`, `POST /grooming/bookings/:id/cancel`.
- Admin: CRUD `/admin/stores` (+ hours, closures), `PUT /admin/stores/:id/stock`, CRUD `/admin/grooming-services`, `GET /admin/grooming/bookings`, `POST /admin/grooming/bookings/:id/cancel`, `POST /admin/orders/:id/pickup-ready`, `POST /admin/orders/:id/collected`.
- Needs his OK: `leaflet` (web) with OpenStreetMap tiles under their tile usage policy.

## Touches shared files
`routes.tsx`, Header (Stores link), Footer, `shipping_methods` quote code and shared quote schema, checkout page, order state machine and order emails (phase 9), `inventory_adjustments`, schema index, seed index, admin nav and orders screen, account nav, PDP (availability line).
Depends on: phase 20 optionally (tracking shows pickup), otherwise none. Opening hours data is reused by nothing else.
