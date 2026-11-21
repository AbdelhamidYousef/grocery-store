# Phase G5: Delivery slots

Goal: the shopper picks when the bag arrives. Each dark store offers 1-hour slots with a fixed
capacity, a chosen slot is held for 15 minutes while the shopper checks out, a job clears expired
holds, and an express "within 30 minutes" option appears when the store is open and has a rider
free. The parcel-style delivery estimate ("order by 15:00, arrives Tue") from Pawsome goes away.

## Learn / explain
- **Capacity by counting, not by a counter.** A slot is full when `active holds + booked orders >=
  capacity`. Counting rows that exist (and ignoring holds that expired) cannot drift the way a
  `booked` counter can when a code path forgets to decrement it. The price is one count query per
  booking, which is cheap with an index.
- **Serialising the last place.** Two shoppers grab the last place at the same moment: both count
  7 of 8, both insert, the slot ends up at 9. The fix is to lock the slot row (`SELECT … FOR
  UPDATE`) inside the transaction before counting, so the second waits and then sees 8. The
  concurrency test proves it.
- **A hold is not an order.** It belongs to the cart and expires by itself (`expires_at`); nothing
  has to run for it to stop counting. The job only deletes old rows to keep the table small. When
  the order is placed the hold becomes the order's `slot_id`, and a cancelled order frees its place
  because cancelled orders are not counted.
- **Time zone.** Slots are stored as `timestamptz`; days, opening hours and labels are computed in
  `Europe/Berlin` (the shop's zone), never the visitor's.

## Data model (migration 0047)
- `delivery_slots`: `id`, `store_id` (FK dark_stores), `starts_at`, `ends_at` (timestamptz),
  `capacity` int (> 0), timestamps; unique (`store_id`, `starts_at`); index on (`store_id`,
  `starts_at`).
- `slot_holds`: `id`, `slot_id` (FK, cascade), `cart_id` (FK carts, cascade, **unique**: one hold
  per cart), `expires_at`, `created_at`; index on (`slot_id`, `expires_at`).
- `dark_stores`: add `opens_at` / `closes_at` (local time, default 08:00 / 22:00), `slot_capacity`
  (default 8), `express_riders` (default 2: express orders allowed per 30 minutes).
- `orders`: add `delivery_kind` (`'slot' | 'express'`, nullable for old orders), `slot_id` (FK,
  set null), `delivery_from` / `delivery_to` (timestamptz snapshot shown everywhere, so a deleted
  slot never loses the window).
- Shipping methods: seed `slot` (2.99 €, free over 49 €) and `express` (4.99 €, never free);
  the old `standard`/`express` parcel methods are deactivated. G9 refines fees by slot and area.

## Step G5.1: slot model and generation
- Shared (`packages/shared/src/slots.ts`): `SHOP_ZONE = 'Europe/Berlin'`, slot rules (1 hour,
  bookable until 60 minutes before start, 7 days ahead), pure helpers to build a day's slot starts
  for a store's hours (DST-safe: build local wall times, convert with Intl), labels ("Today
  14:00–15:00", "Tomorrow", weekday). Unit tests including the DST change days (2027-03-28,
  2026-10-25 style).
- Job `generate-slots` in the job runner: for each active store, create missing slots for the next
  7 days (idempotent on the unique key). Runs on boot of the runner and daily; the seed runs it too.
- Commit: `feat(slots): delivery slots per dark store`

## Step G5.2: holds, capacity and the release job (API, risky)
- `GET /api/delivery/slots` (store from `deliveryContext`) → days, each with slots `{id, startsAt,
  endsAt, remaining, status: 'open' | 'full' | 'closed'}` (closed = past the 60-minute cutoff), plus
  `express: { available: boolean, reason?: 'closed' | 'busy' | 'no_postcode' }`.
- `PUT /api/cart/slot {slotId}` → in one transaction: lock the slot row, reject past-cutoff
  (`422 SLOT_CLOSED`), count active holds of other carts + booked orders (`status` not cancelled /
  refunded), reject when full (`409 SLOT_FULL`), upsert this cart's hold with `expires_at = now +
  15 min`. Re-putting the same slot extends the hold. `DELETE /api/cart/slot` drops it. `PUT
  /api/cart/express` / the cart response carries `delivery: {kind, slot, holdExpiresAt}`.
- The slot must belong to the store of the cart's postcode; at checkout the address's store must
  match the slot's store (`422 SLOT_WRONG_AREA`) and the hold must still be live (`409
  SLOT_HOLD_EXPIRED`). Placing the order sets `delivery_kind`, `slot_id`, the window snapshot and
  deletes the hold (same transaction as the stock reservation).
- Express: allowed when the store is open now and the express orders of that store placed in the
  last 30 minutes (not cancelled) are fewer than `express_riders` (store row locked while counting).
  Window = now → now + 30 min.
- Job `release-slot-holds` (every 5 minutes): delete holds expired more than an hour ago. Expired
  holds already stop counting without it.
- Tests: capacity, cutoff, wrong area, expired hold, cancelled order frees its place, express busy,
  and a concurrency test (two carts racing for the last place: exactly one wins).
- Commit: `feat(slots): slot holds with capacity and express delivery`

## Step G5.3: slot picker and delivery times in the web
- Checkout: a "Delivery time" step before payment: express card (when available) and a slot picker
  (day tabs, hour buttons, full and closed ones disabled with a reason), the hold countdown ("Held
  for 14:32"), and what happens when it runs out (pick again).
- Replace the parcel delivery estimate on the PDP, cart and header with "Next delivery: today
  14:00–15:00" from the slots endpoint (or "Express in 30 minutes" when available). Remove the
  Pawsome cutoff estimate and its Amsterdam constants once nothing uses them.
- Order confirmation, account order page, order emails and tracking page show the window.
- English and German strings, tone per `03-conventions.md` ("Arrives 14:00–15:00").
- Commit: `feat(web): delivery slot picker and delivery times`

## Step G5.4: phase end
- Gates + e2e (spec: postcode → add to basket → pick a slot → pay with the test card → the
  confirmation shows the window; a full slot is disabled). Journal, quiz, handover, push.
  Commit: `docs(plan): phase G5 done`
