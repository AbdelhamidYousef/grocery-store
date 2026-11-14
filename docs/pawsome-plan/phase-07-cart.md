# Phase 7 — Cart (server-side, guest + account, merge on login)

Goal: one cart implementation for guests and users, re-priced from the catalog on every read, with
stock-aware quantities and a merge on login/register.

## Step 7.1 — cart identity middleware
- `middleware/cart.ts`: `resolveCart(req)` → if `req.user`, find/create the user's active cart; else
  read signed cookie `cart_id`, validate it points to an `active` guest cart, else create a new guest
  cart and set the cookie (30 d, httpOnly, SameSite=Lax). Attach `req.cartId`. Creation is lazy: only
  on first mutation or `GET /cart` (don't create carts for every visitor — explain).
- Learn / explain: signed cookies vs encrypted; cart as a server resource.
- Commit: `feat(api): add cart identity resolution`

## Step 7.2 — cart service: read + reprice
- `getCart(cartId)`: items joined with variant, product, primary image, inventory. Compute per line
  `unitPriceCents` (current), `available` (quantity − reserved), `maxQty = min(99, available)`,
  `lineTotal`; cart `subtotal`, `itemCount`, `weightGrams`. `warnings[]`: `OUT_OF_STOCK` (available
  0), `QTY_REDUCED` (qty > available → clamp **in the response only**, and persist the clamp), 
  `VARIANT_UNAVAILABLE` (archived → remove and warn). Shared `CartSchema`.
- Tests for each warning.
- Commit: `feat(api): add cart read with repricing and stock warnings`

## Step 7.3 — mutations
- `addItem` (upsert, `quantity + existing ≤ available` else 409 `OUT_OF_STOCK` with `available` in
  details), `updateItem` (0 → delete), `removeItem`, `clear`. All in transactions with
  `SELECT … FOR UPDATE` on the cart row to serialise concurrent adds (demonstrate with a test that fires
  two adds in parallel).
- Routes per contract. Return the full cart after every mutation (one round trip for the UI).
- Learn / explain: row locks; why return the whole cart.
- Commit: `feat(api): add cart item mutations`

## Step 7.4 — merge on login
- `mergeGuestCart(guestCartId, userId)`: in a transaction, sum quantities per variant into the user's
  active cart (clamped to available), mark guest cart `merged`, clear `cart_id` cookie. Wired into the
  `onLogin` hook from phase 6 and register.
- Tests: guest adds 2, logs in with existing cart of 1 → 3; clamp case.
- Commit: `feat(api): merge guest cart into user cart on login`

## Step 7.5 — web: cart state
- `api/cart.ts`; `features/cart/useCart()` (query `['cart']`), mutations with **optimistic updates**
  for quantity changes and rollback on error; toast on `OUT_OF_STOCK`. Header badge from `itemCount`.
  `track('add_to_cart')` / `remove_from_cart`.
- Wire PDP "Add to cart" (phase 5.8): success → toast with "View cart", button loading state.
- Learn / explain: optimistic updates in TanStack Query (`onMutate`/`onError`/`onSettled`).
- Commit: `feat(web): add cart state and wire add to cart`

## Step 7.6 — web: cart page + mini cart
- `/cart`: line items (image, name, variant, unit price, stepper, remove, line total), warnings
  rendered inline (sold out line greyed, "price changed" notice), subtotal, "free shipping over X"
  progress hint, "Proceed to checkout" (disabled if any `OUT_OF_STOCK` line), empty state. Mini-cart
  drawer from header icon (same component, compact).
- e2e: add → change qty → remove → empty state; guest cart survives reload; merge on login.
- Commit: `feat(web): add cart page and mini cart`

Phase 7 done when: concurrent adds can't oversell, merge works, and the cart survives reload and login.
