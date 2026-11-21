# Phase G7: Substitutions

Goal: when something is missing at packing time, the shop does what the shopper asked. Each basket
line says "best match", "this specific product" or "don't replace, refund it". The packer records
what was swapped, the shopper accepts or rejects each swap (in the app before the rider leaves, or at
the door), and the money follows: a swap is never charged above the original price, and a rejected
swap is not charged (before capture) or refunded (after capture).

## Learn / explain
- **A best match must be safe before it is similar.** The candidate may not add an allergen the
  original did not have, and must keep every dietary tag the original had (vegan stays vegan,
  gluten-free stays gluten-free). Only then rank by closeness: same subcategory, price within ±30 %,
  in stock at the shopper's store, closest price first. Unit-tested in shared code; this rule is
  the one an interviewer will ask about.
- **Capture makes refunds rare.** Because the card is only authorised until the bag is packed (G6),
  anything decided before dispatch is just a smaller capture. Only a rejection at the door, after
  capture, needs a partial refund, which reuses the refund path returns already have.
- **Customer never pays more.** A substitute line is charged `min(substitute price, original
  price)` per unit; the difference is shown as "You save".

## Data model
- `cart_items` and `order_items`: `substitution` enum `best_match | specific | none` (default
  `best_match`), `substitute_variant_id` (for `specific`).
- `order_items`: `pick_status` enum `pending | picked | short | missing | substituted`,
  `picked_qty`; substitute lines are their own `order_items` rows with `substitutes_item_id` →
  original line and `swap_status` enum `proposed | accepted | rejected`, priced as above.
- `users`: `default_substitution` (account preference, applied to new lines).

## Step G7.1: preferences per line
- Cart line control ("If it's missing: Best match / Choose a product / Refund it"), "Apply to all",
  the account default; the choice is copied to the order line. A specific substitute is picked
  from the best-match list for that line (top 5), so it is always safe.
- Shared `bestMatches(original, candidates)` in `packages/shared/src/substitutions.ts` with tests
  (allergen, dietary, price band, stock, ranking); API `GET /api/products/:slug/substitutes`.
- Commit: `feat(cart): substitution preference per line`

## Step G7.2: swaps, approval and money (API, risky)
- Service `recordShortfall(orderItemId, {pickedQty, substituteVariantId?})` (used by the G8 packer
  view; admin endpoint now): marks the line short/missing, creates the substitute line
  (`proposed`), reserves and allocates its stock (FEFO) at the order's store, and respects the
  preference (`none` → no swap; `specific` → only that product).
- Shopper: `POST /api/orders/:number/swaps/:itemId {decision}` (signed-in owner, or the signed
  link in the email). Accepted → charged; rejected → stock released, line not charged. Unanswered
  at dispatch → accepted (said in the email and on the page).
- `finalizeOrder` (G6) computes the capture from picked quantities, weights and accepted swaps.
- Door rejection after capture: `POST /api/admin/orders/:number/swaps/:itemId/reject-at-door` →
  partial refund of that line through the existing refund path, idempotent.
- Email "We changed something in your order" listing swaps and missing items with accept/reject
  links; the final bill email shows them.
- Tests: each preference, allergen-safe only, price cap, accept/reject before capture, reject at
  door refunds exactly the line, retries are idempotent.
- Commit: `feat(orders): substitutions with approval and partial refunds`

## Step G7.3: the shopper's view
- Account order page and tracking page: "Changes to your order" with each swap (photo, name,
  price, "You save"), Accept / Reject buttons until dispatch, then the outcome. Missing items show
  "Not charged". English and German.
- Commit: `feat(web): review substitutions in the order`

## Step G7.4: phase end
- Gates + e2e (order with a line set to best match; admin records it missing with a swap; the
  shopper rejects it; the final capture excludes it). Journal, quiz, handover, push.
  Commit: `docs(plan): phase G7 done`
