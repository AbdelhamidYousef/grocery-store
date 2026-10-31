# Phase 18 — Promotions engine

Goal: ONE pure pricing function that turns a cart into priced lines, adjustments, shipping and a total,
so codes, bulk tiers, gifts, flash sales and member prices can never disagree between cart, checkout and order.

## Learn / explain
- A **pure function** (`priceCart(input) → PricedCart`, no DB, no clock, no I/O) is the only place price maths lives;
  services load data, call it, and persist the result. That is what makes 100% unit-testing cheap.
- **Stacking rules are product decisions**, written down once and rendered to the customer as text from the engine's output.
- **Integer cents + largest-remainder allocation**: an order-level discount is split across lines so line sums equal the total exactly (refunds need this).
- **EU Omnibus Directive**: any "was/now" price must show the lowest price charged in the 30 days before the reduction, which needs an append-only price history.
- Server recomputes at checkout; the client price is display only ("never trust the client with the amount").

## The engine contract (`packages/shared/src/pricing/`)
Input: `now` (injected), `currency` (cents are in this currency; the engine never converts, phase 21 supplies per-currency inputs), `lines[{variantId, productId, qty, baseCents, saleCents?, memberCents?, onSale, fixedPrice}]` (`fixedPrice` = trial sizes from phase 14 and bundles from phase 16: base price only, excluded from order discounts/codes, still counted toward shipping and gift thresholds), `customer{isMember, orderCount, id|email}`,
`code?` (already loaded and validated for time/usage by the service, engine re-checks min spend and exclusions), `tiers[]`, `giftRule?`,
`shipping{methodCents, freeOverCents?}`, `credits[]` (phase 19: points, referral; default empty), `roundUpDonation?` (phase 19).
Output: lines with `unitCents`, `lineDiscountCents`, `appliedPromos[]`; `adjustments[{type, refId, label, cents}]`; `shippingCents`;
`totalCents`; `progress{freeShipping, gift, nextTier}` (remaining cents + percent); `notices[]` (machine keys such as `code_not_stackable`, `code_min_spend`).
**Stacking order (fixed, shown on a "How discounts combine" panel in cart):**
1. Line price: best single price per line = min(base, flash-sale, member). Prices never stack with each other.
2. Order discount: bulk tier OR percent/fixed code, whichever saves more. Not both. Codes with `excludeSaleItems` ignore lines at a sale price.
3. Gift: free item added when merchandise total after step 2 reaches the threshold (so a discount cannot leave a free gift unearned-but-given).
4. Shipping: free if over the method's threshold, or a free-shipping code. Free-shipping codes stack with everything.
5. Credits (points, referral credit) last, capped at remaining total, never on shipping. Total never below 0.

All order-level adjustments, credits included, are allocated to lines (largest remainder) and persisted in `order_items.discount_cents`: that column is the single source phase 22 uses for refund amounts. The round-up donation is a separate order field, never part of a line.

## Step 18.1 — engine core + money rules
- `pricing/types.ts` (Zod), `priceCart.ts` for steps 1, 2 (tier + fixed/percent codes), 4 (threshold shipping), `allocate.ts` (largest remainder). Percent rounds half-up on cents.
- Tests (table-driven, also property test: sum of lines == total; total >= 0; deterministic): tier vs code picks best; sale line plus excluded code; fixed code larger than cart; rounding on 3 lines x 33 cents.
- Commit: `feat(shared): add pure pricing engine`

## Step 18.2 — engine: gifts, progress, credits, notices
- Gift rule (threshold, gift variant, free, one per order, only if in stock: service passes `giftAvailable`). Progress bars data. Credits and round-up hooks (no-ops now, used by phase 19).
- Tests: threshold boundary (3999 vs 4000), gift removed when cart drops, progress 100% state, credits cap.
- Commit: `feat(shared): add gifts, progress and credits to pricing engine`

## Step 18.3 — schema: codes, tiers, gifts, redemptions, snapshots
- Tables below; checks (`percent 1..100`, `fixed > 0`, `ends_at > starts_at`). `orders.discount_cents` already exists; add `order_promotions` snapshot rows. Seed: 3 codes (PAWS10, WELCOME5 fixed, FREESHIP), 2 tiers (5% over 7500, 10% over 10000), one gift rule (4000), none of it active in tests unless set.
- Commit: `feat(api): add promotions schema and seed`

## Step 18.4 — API: validate code + priced cart
- `promotions` module: repo (load active rules), service (`loadPricingContext`), `POST /cart/code` apply or `DELETE /cart/code`; cart GET now returns the engine output. Code errors are specific and kind ("Needs EUR 15 more", "Expired 12 Oct", "Already used").
- Usage caps: `discount_redemptions` row inserted in the order-creation transaction under a unique `(code_id, order_id)` plus `SELECT ... FOR UPDATE` on the code row for the global cap; per-customer cap counts by user id, or lowercased email for guests. Reserved on order create, released with the stale-reservation job on payment failure or expiry (reuses phase 9 job); redemptions are not released on later cancellation of a paid order (the code was consumed).
- Tests: cap race (two parallel checkouts, cap 1, one wins); per-customer cap guest vs account; expired; min spend; sale-excluded.
- Commit: `feat(api): add discount code and priced cart endpoints`

## Step 18.5 — checkout + order snapshot
- Checkout service calls the engine inside its transaction, writes `order_promotions` (type, ref id, label, cents) and line-level `discount_cents`; PaymentIntent/fake-gateway amount comes from `totalCents`. Stripe is not configured: all of this is exercised through the existing simulated gateway and `/test/webhooks/simulate` in tests and e2e.
- Tests: stored order total equals engine total; later editing a code does not change old orders; amount sent to gateway matches.
- Commit: `feat(api): price checkout through the promotions engine`

## Step 18.6 — flash sales + Omnibus price history
- `price_history(variant_id, price_cents, kind base|sale|member, valid_from)` append-only; written by admin price edits (phase 10 service hook) and when a sale activates. The `activate-sales` job (the job runner is owned by phase 19, merged after this phase: until then called lazily on read, afterwards registered there too) flips `scheduled` to `active`/`ended`.
- Omnibus reference = min `price_cents` over the 30 days before the sale's `starts_at`, stored in `sale_items.reference_cents` on activation. PDP, PLP and cart show "Was EUR x (lowest price in last 30 days)" next to every sale price. Never use `compare_at_price_cents` as the reference on sale items.
- `GET /promotions/banner` returns active or next sale with `endsAt` AND `serverNow`; the web countdown uses the offset so a wrong device clock cannot lie.
- Tests: reference ignores the sale's own price; price raised then cut inside 30 days; sale ends exactly at `ends_at`; no history = no strike-through.
- Commit: `feat(api): add flash sales and omnibus price history`

## Step 18.7 — member prices
- `product_variants.member_price_cents` (null = none). Signed-in users get `memberPriceCents`; anonymous responses only get `hasMemberPrice: true` (rejected: sending the number and hiding it in CSS, which leaks it). Responses with member data are `Cache-Control: private`, `Vary: Cookie`. PDP shows "Member price: log in to see" with a login link that returns to the product.
- Tests: anon payload has no number; member sees it; cart re-prices after login merge.
- Commit: `feat(api): add member prices`

## Step 18.8 — admin API + screens
- CRUD: `/admin/discount-codes`, `/admin/flash-sales` (with items), `/admin/bulk-tiers`, `/admin/gift-rule`; member price field added to the phase 10 variant form; each mutation audit-logged. Code form shows a live preview ("10% off, min EUR 30, 5 of 100 used"). Delete = archive when redemptions exist.
- Tests: non-admin 403; overlapping tiers rejected; sale ending before start rejected.
- Commit: `feat(web): add admin promotions management`

## Step 18.9 — storefront UI
- Mini-cart and cart: free-shipping and gift progress bars (`role="progressbar"`, aria values), code input, itemised adjustments, "How discounts combine" disclosure, site-wide countdown banner (dismissible per sale, `data-testid="sale-banner"`), Omnibus line, member teaser. `track('promo_applied')`, `track('code_failed')`.
- Commit: `feat(web): add promotions UI and sale banner`

## Step 18.10 — e2e
- Spec `promotions.spec.ts`: add EUR 38 item, bar shows EUR 2 to gift, add more, gift appears; apply PAWS10 vs 10% tier, best wins and the panel says why; admin schedules a sale, banner and Omnibus text show, order snapshot visible in admin order detail. Simulated gateway pays.
- Commit: `test(e2e): add promotions flow`

Phase 18 done when: cart, checkout, emails and admin all show the same totals from one engine, every stacking rule is unit-tested, and Omnibus text appears on every discounted price.

## Schema & API changes
Migration `00XX_promotions`. New tables: `discount_codes` (code citext unique, kind percent|fixed|free_shipping, value, min_spend_cents, starts_at, ends_at, max_uses, per_customer_max, exclude_sale_items, first_order_only, owner_user_id null, active), `discount_redemptions`, `bulk_tiers` (min_cents, percent), `gift_rules` (threshold_cents, variant_id, active), `flash_sales` (name, starts_at, ends_at, status), `flash_sale_items` (sale_id, variant_id, sale_price_cents, reference_cents), `price_history`, `order_promotions`. Columns: `product_variants.member_price_cents`, `order_items.discount_cents`.
Endpoints: `POST /cart/code` (cart identity), `DELETE /cart/code` (cart identity), `GET /promotions/banner` (public), `GET /promotions/rules` (public, tiers and thresholds for copy), `/admin/discount-codes|flash-sales|bulk-tiers|gift-rule` CRUD (admin).

## Touches shared files
`routes.tsx` (none), Header (banner slot above header), cart service and checkout service (call engine), seed index, schema index, phase 10 variant form (member price), PDP/PLP price component, `packages/shared/src/index.ts`.
