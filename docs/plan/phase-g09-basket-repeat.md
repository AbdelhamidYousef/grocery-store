# Phase G9: Basket rules and repeat shopping

Goal: the basket follows real quick-commerce rules (minimum order, delivery fee by slot and area,
free delivery over a threshold, bag fee, bottle deposit) computed by one pure, tested function,
and regulars shop faster ("Your usuals", reorder the last basket, named lists).

## Learn / explain
- **One function for the totals.** `basketTotals(lines, context)` in shared code returns every
  line of the bill (subtotal, deposit, bags, delivery, discount, total, and what is missing to reach
  the minimum or free delivery). The cart, checkout, order snapshot and emails all show its output,
  so the numbers cannot disagree. The server recomputes it; the client's numbers are never trusted.
- **Deposit is not revenue.** Pfand (0.25 € per bottle) is money held for the bottle, so it is its
  own line, excluded from the free-delivery threshold and from discounts.
- **Usuals from orders, not from a model.** "Bought in at least 2 of your last 10 orders, most
  often first, in stock at your store." Explainable, cheap, testable.

## Rules (constants in `packages/shared/src/basket-rules.ts`, stated on `/delivery`)
- Minimum order 15 € (goods only). Below it checkout is blocked with "Add 3.20 € more".
- Delivery fee: slot 2.99 €, peak slots (17:00–20:00) +1.00 €, express 4.99 €; outer areas
  (Neukölln) +0.50 €. Free for slots over 49 € goods; express is never free.
- Bags: 0.25 € per bag, `ceil(units / 8)`, or "No bags, use boxes" (free).
- Deposit: from `catalogue.json` `deposit` (0.25 € or 0.08 € per unit), per variant column
  `deposit_cents`.

## Step G9.1: basket rules
- Shared `basketTotals` + tests (edge cases: exactly 15 €, exactly 49 €, deposit not counted,
  weighed estimate counted, short-dated price counted, express never free, discount applied to goods
  only). Migration: `product_variants.deposit_cents`, `carts.bags` boolean, order snapshot columns
  (`deposit_cents`, `bag_fee_cents`, `delivery_fee_cents`). Replace the shipping-method price with
  it (shipping methods keep only the delivery kind).
- Web: cart and checkout bill lines, "Add X for free delivery", minimum-order block, the bags
  toggle; emails and order pages show the same lines. English and German.
- Commit: `feat(cart): minimum order, delivery fees, bags and deposit`

## Step G9.2: usuals and reorder
- `GET /api/me/usuals` (rule above); home "Your usuals" strip (signed in) replaces the G3
  placeholder; account page. "Reorder last basket" adds what is in stock at the current store and
  lists what is not (the existing reorder service, now store-aware).
- Commit: `feat(reorder): your usuals`

## Step G9.3: shopping lists
- Lists build on wishlists: a shopper can have several named lists ("Weekly shop", "Party"), with
  quantities; "Add all to basket" (in-stock lines, reports the rest). Migration turns the wishlist
  into the default list "Saved" (add, backfill, keep the old routes working).
- Commit: `feat(lists): named shopping lists`

## Step G9.4: phase end
- Gates + e2e (below-minimum block, free delivery reached, deposit line, add a list to the basket).
  Journal, quiz, handover, push. Commit: `docs(plan): phase G9 done`
