# Phase 16 — Product page depth

Goal: a product page that answers every pre-purchase question: tabs, specs, a feeding calculator, size guide,
bundles, recommendations and an honest delivery estimate. Assumes phase 14 data (health tags, unit pricing, brands).

## Learn / explain
- **Modelling structured content**: why constituents and feeding tables are rows with integer units (basis points,
  grams), not free text or floats, and how that makes the calculator testable.
- **Pure domain functions in `packages/shared`**: feeding maths, delivery date maths, bundle price/stock. The UI is
  thin; the clock is injected so tests are deterministic.
- **Time zones and business days**: store zone is explicit, the visitor's zone is only for display.
- **Derived stock**: a bundle's availability is computed from components, never stored (no drift).
- **Accessible tabs and dialogs**: roving tabindex, `aria-selected`, focus trap and return in the modal.

## Step 16.1 — structured PDP content: schema + API
- Tables: `variant_constituents` `(variant_id, key, value_bp int)` (protein 2650 = 26.50 %; keys: protein, fat,
  fibre, ash, moisture, plus kcal per 100 g as plain int); `product_faqs` `(id, product_id, question, answer,
  sort_order)`; `product_specs` `(product_id, label, value, sort_order)`; `size_guides` `(id, slug, title,
  rows jsonb, howto_md, tip)` linked by `products.size_guide_id`; `feeding_rows` `(product_id, pet_weight_g_min,
  pet_weight_g_max, daily_g, life_stage enum puppy|adult|senior|any)`; `products.delivery_note` null.
- `GET /products/:slug` extended with `specs`, `constituents` (per variant), `faqs`, `feedingTable`, `sizeGuide`.
- Validation: feeding bands in a product must not overlap or leave gaps (Zod refine, tested).
- Commit: `feat(api): add structured product content`

## Step 16.2 — admin: PDP content
- Product form gains tabs: Specs editor, Constituents per variant (percent inputs converted to basis points at the
  edge), FAQ list (add/reorder/delete), Feeding table editor with the gap/overlap validator inline, Size guide
  picker + `/admin/size-guides` screen (rows editor, how-to text).
- Commit: `feat(web): add admin product content editors`

## Step 16.3 — PDP tabs
- Description · Specs · Feeding guide · Delivery & returns, as accessible tabs (arrow keys, Home/End, panel
  `tabindex=0`); tab state in URL hash (`#feeding`). Tabs with no data are omitted (a toy has no feeding guide).
- Specs tab: key/value table plus constituents table that switches with the selected variant; FAQ accordion below
  (static Q&A, admin-edited, replaces a public Q&A feature: no moderation, spam or PII). Emit `FAQPage` JSON-LD via `<Seo>`.
- Delivery & returns tab reads shared policy copy plus the product's `delivery_note`.
- Commit: `feat(web): add product detail tabs and FAQ`

## Step 16.4 — feeding calculator
- `calculateFeeding(rows, { weightG, lifeStage })` in shared: picks the band, interpolates linearly between
  adjacent band midpoints using integer arithmetic (round half up), returns `dailyG`, `portions` (2 by default,
  1 for adult cats optional), `gramsPerPortion`, `daysPerBag(sizeG)`, `costPerDayCents` (uses variant price; no
  float money). Out-of-range weights clamp with a visible note, never a silent guess.
- UI: slider + numeric input (kg with one decimal shown, grams stored), life-stage select prefilled from the active
  pet (phase 15, optional), animated "cup" visual (CSS only, `prefers-reduced-motion` respected), result as text
  first ("About 280 g a day, two meals of 140 g"), "This bag lasts ~21 days, about €0.84 a day", a
  "Pick the bag size that lasts a month" button that selects the variant. Disclaimer: guidance, ask your vet.
- Tests: boundaries, clamp, interpolation monotonic, rounding, days per bag; component test with typed weight.
- Commit: `feat(web): add interactive feeding calculator`

## Step 16.5 — size guide modal
- Dialog (focus trap, Escape, return focus, scroll lock) opened from "Size guide" next to the size picker;
  table from `size_guides.rows`, "How to measure" steps with illustrations (original SVGs, CREDITS.md), and the
  tip "In between sizes? Size up." shown when the guide's `tip` is set. Highlights the selected variant's row.
- Commit: `feat(web): add size guide modal`

## Step 16.6 — recommendations + recently viewed
- Table `product_relations` `(product_id, related_id, kind bought_together|related, sort_order)`; admin editor in
  the product form. API fallback when empty: co-purchase counts from `order_items` (paid orders), then same
  category/brand. (Rejected: ML; too little data and unexplainable.)
- "Frequently bought together": up to 3 items, checkboxes, live total, **Add all** sends one `POST /cart/items/bulk`
  (all-or-nothing in a transaction, per-line stock and phase 14 trial-limit errors returned). Mini-cart shows "You might also need" (2 items,
  excluding what is in the cart).
- Recently viewed (homepage placement = a `HomeSlot` registered as `recently-viewed`, phase 20 owns the registry): ids in `localStorage` (max 12, per visitor), strip rendered from `GET /products/by-ids?ids=`
  (ordered, active only). Shown on PDP, cart and homepage.
- Commit: `feat: add bought-together, related and recently viewed`

## Step 16.7 — delivery estimate
- `estimateDelivery(now, rules)` in shared. Rules in code config: store zone `Europe/Amsterdam`, cutoff 15:00
  Mon-Fri, dispatch next business day after cutoff, 1-2 business days transit by shipping method, holidays list
  for the year. Output: "Order in 3h 20m, arrives Tue 4 Nov" and the zone stated: "Cutoff 15:00 CET". Countdown
  ticks per minute, `aria-live=off` (no chatter), static text for screen readers.
- Tests: before/after cutoff, Friday after cutoff, holiday skip, DST change week, injected clock.
- Commit: `feat(shared): add delivery estimate`  (web wiring in the same PDP step: `feat(web): show delivery estimate`)

## Step 16.8 — bundles / kits
- Table `bundle_items` `(bundle_variant_id, component_variant_id, qty)`; a bundle is a normal product+variant
  (kind column on `products`: `simple|bundle`) so cart, search and SEO keep working. **The bundle's price is its
  variant's `price_cents`** (single source; later phases add per-currency prices in `variant_prices`, phase 21); no
  separate bundles price column. Admin validates `price < sum(components)` (per currency) and no nested bundles.
  Pricing: phase 18's `priceCart` treats bundle lines as `fixedPrice` (no flash/member price, excluded from order
  discounts and codes, still counted for shipping and gift thresholds).
- Stock = `min(floor(component_available / qty))`, computed in the catalog query. Checkout/inventory reservation
  expands a bundle line into component reservations (touches phase 9 service; covered by tests incl. rollback); phase 23 (pickup `store_stock`) and phase 22 (return restock) reuse the same expansion helper.
  Works through the fake payment gateway as for any order.
- PDP shows "Save €X vs individually" (integer cents). Component PDPs get a "Make it a kit" block listing bundles
  that contain this variant. Admin screen `/admin/bundles` (component picker, live saving preview).
- Commit: `feat: add bundles and kits`

## Step 16.9 — e2e
- Open a food PDP, switch tabs by keyboard, use the calculator and pick the suggested bag, open size guide on a
  harness, add a bundle, add FBT items with Add all, check delivery text, reload and see recently viewed.
- Commit: `test(e2e): add product page depth flows`

Phase 16 done when: a customer can size, feed-plan and price a purchase from the PDP alone, and every new block
has an admin editor.

## Schema & API changes
- Migration `00XX_pdp_depth`: `variant_constituents`, `product_faqs`, `product_specs`, `size_guides`,
  `feeding_rows`, `product_relations`, `bundle_items`; columns `products.size_guide_id`,
  `products.delivery_note`, `products.kind`.
- Extended `GET /products/:slug` (specs, constituents, faqs, feedingTable, sizeGuide, bundles, relations).
- `GET /products/by-ids` (public), `GET /products/:slug/recommendations` (public), `POST /cart/items/bulk` (guest/user).
- `GET/POST /admin/size-guides`, `PATCH/DELETE /admin/size-guides/:id`, `GET/POST /admin/bundles`,
  `PATCH/DELETE /admin/bundles/:variantId` (bundle = variant id), `PUT /admin/products/:id/content` (specs, faqs, feeding, constituents,
  relations in one transaction) (admin).

## Touches shared files
`routes.tsx` (admin screens), PDP page, mini-cart, homepage (recently viewed), cart + checkout/inventory service
(bundle expansion), admin product form, schema index, seed index (feeding tables, FAQs, 3 bundles for phase 14
products), `packages/shared` index.

## Dependencies / needs his OK
Needs phase 14 (unit pricing, brands, health tags). Phase 15 `petToFilters`/active pet is optional input to the
calculator. Holiday list and cutoff are fictional constants, stated as such. Nothing needs a new library.
