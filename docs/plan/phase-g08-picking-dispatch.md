# Phase G8: Picking and dispatch

Goal: the back of the shop. Each dark store has a packer view of the orders due in the next slots,
a pick list walked in aisle order (ambient, then chilled, then frozen, so cold food is out of the
fridge for the shortest time), weighing and shortfalls recorded per line, the final amount captured
when the bag is packed, and a handover to a rider whose progress is simulated on the tracking page.

## Learn / explain
- **Why the walk order matters.** A packer walks the store once per batch of orders. Sorting the
  list by aisle turns a zig-zag into one loop; putting frozen last keeps it frozen.
- **Simulated, and said so.** There are no real riders. Progress is computed from the dispatch time
  and the delivery window (a pure function, tested), and the page says it is a demo.
- **Status words for groceries.** The engine's statuses keep their names; the shop shows grocery
  words: paid → "Order received", processing → "Being packed", shipped → "On the way", delivered.

## Data model
- `aisles`: per store, `subcategory_id` → `aisle` (int) and `zone` enum `ambient | chilled |
  frozen`. Seeded from the departments (one layout reused by all four stores, with a small shuffle so
  stores differ).
- `orders`: `packed_at`, `dispatched_at`, `rider_name` (from a made-up list), `delivered_at`.

## Step G8.1: packer view (admin)
- Role check: admin (existing). `GET /api/admin/stores/:slug/picking?window=next` → paid orders of
  that store whose window starts within 2 hours, and express orders, oldest window first.
- Batch pick list: all lines of the selected orders merged, sorted by zone (ambient, chilled,
  frozen), then aisle, then product, with the batch to take (FEFO allocation from G6) and the bag
  (order) each unit goes to.
- Per order: mark each line picked (quantity), enter grams for weighed lines (sets `weighed_grams`,
  `final_cents`), or record a shortfall with a swap (G7 `recordShortfall`, best matches offered).
- Web: `/admin/picking` (store switcher, list, order panels), keyboard-friendly, works on a
  tablet width.
- Commit: `feat(admin): packer view with aisle-sorted pick lists`

## Step G8.2: pack, capture and dispatch (API, risky)
- "Bag packed": all lines resolved → `packed_at`, status `processing`; waits for swap answers
  until dispatch.
- "Hand to rider": `finalizeOrder` captures (G6/G7), assigns a rider name, `dispatched_at`, status
  `shipped`, email "On the way, arriving 14:00–15:00".
- Job `deliver-simulated` (every 5 minutes): orders dispatched whose simulated arrival passed →
  `delivered`, email. Rider at the door can record a rejected swap (G7) until delivered.
- Tests: cannot pack with unresolved lines, capture happens once, dispatch is idempotent, job
  delivers on time.
- Commit: `feat(orders): packing, capture on dispatch and simulated delivery`

## Step G8.3: tracking page
- `/track/:number` (existing tracking feature): grocery steps (received, being packed, on the way,
  delivered), the window, the rider's first name, a simulated progress bar and "about 12 minutes
  away" from the pure `riderProgress(dispatchedAt, windowEnd, now)` (shared, tested), the swaps
  (G7). Polls every 30 s while on the way. English and German.
- Commit: `feat(web): live order tracking for groceries`

## Step G8.4: phase end
- Gates + e2e (admin picks an order with a weighed item, packs, dispatches; the shopper's tracking
  page shows "On the way" and the captured total). Journal, quiz, handover, push.
  Commit: `docs(plan): phase G8 done`
