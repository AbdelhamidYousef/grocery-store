# Plan 00: Overview (DRAFT, 2026-11-14)

_Draft written by the Pawsome session on 2026-11-14. The owner chose option B: copy Pawsome, remove
the pet features, and put the new work into what a quick-delivery grocery needs. Work runs in parallel
with Pawsome. The shop is called **Grocery** (the owner's call, 2026-11-14: the name should say plainly
what the shop is, nothing clever). The codename is also `grocery`._

## What we are building

A fictional, bright **quick home-delivery shop** for groceries and home basics, in the style of Amazon
Now, Getir or Gopuff. Customers enter a postcode, see whether the shop delivers there, browse fresh
food, the pantry, drinks, household and personal care, fill a basket, **pick a delivery slot** (or "in
30 minutes" where the area allows it), say what to do if something is out of stock, and pay with
Stripe in test mode. Everything is made up: the brand, the products and the shops. Images are generated.

## Why a separate repo, and how it relates to Pawsome

- Copied from Pawsome `main` at `2e9bde4` with full history. The git remote `pawsome` points to the
  local Pawsome repo, so later fixes to the shared engine can be brought over with
  `git fetch pawsome && git cherry-pick <sha>`. There is no GitHub remote yet; that comes with the push, on his go.
- Pawsome's plan is kept in `docs/pawsome-plan/` for reference (phases 00–24, decisions log, journal).
  It describes the engine this repo starts from. Don't edit it.
- **The portfolio story:** Pawsome shows a full catalogue and checkout. This repo shows **logistics**:
  delivery areas, slot capacity, food that expires, items sold by weight, substitutions. Those are the
  parts a reviewer will read. Don't redo here what Pawsome already shows.

## What we keep (the engine, ~75%)

The monorepo, the tooling and the checks (gates); sessions and auth, CSRF, cart, Stripe checkout and
webhooks, orders and order status history, stock and reservations, the email outbox and job runner,
admin, returns, wishlist, search, reviews, promotions and bundles, loyalty and points, i18n and
translations, order tracking, reorder, stock alerts, help centre, newsletter, `money`, `unit-price`,
`plural`, `pricing/`, and the deployment setup (Vercel + Neon).

## What we remove (pet-specific)

| Area | Where | Action |
| --- | --- | --- |
| Pet profiles | `modules/pets`, `features/pets`, `PetsPage`, schema `pets`, `pet-messages`, shared `pets`, `pet-profiles`, `pet-messages` | Delete |
| Vet details | `modules/vet`, schema `order-vet-details` | Delete |
| Feeding calculator | shared `feeding` | Delete |
| Gift finder | `features/gift-finder`, `GiftFinder*Page`, shared `gift-quiz` | Delete |
| Pet gallery (UGC) | `modules/gallery`, `features/gallery`, schema `gallery` | Delete (maybe "recipe photos" later) |
| Charity (shelters) | schema `charity`, `CharityPage` | Delete or retheme as a food bank (decide in G1) |
| Stores and services | Pawsome phase 23 (grooming and similar) | Not copied in (wasn't on `main`) |
| Seed data, images, copy, guides, brand art | `db/seed/*`, `apps/web/public/*`, `content/` | Replace in G3 |

Kept and given a new meaning: `safety` (pet safety notices) becomes **product recalls**. `trials`
(trial sizes) becomes **free samples in the basket**. `size-guides` is removed (not needed for food).

## What we add (the grocery and quick-delivery part)

1. **Delivery areas.** Postcode → area, each area served by one "dark store" (micro-warehouse) with
   its own stock. Shown up front: "We deliver to 10115 ✓, slots from 14:00".
2. **Delivery slots with capacity.** 1-hour slots per area, with a capacity per slot, held while the
   customer checks out (the same idea as Pawsome's stock reservations) and released by the job runner.
   Also an express "within 30 min" option when the area's stock and riders allow it.
3. **Stock per dark store.** Inventory moves from per variant to per variant × store. Availability
   depends on the postcode.
4. **Food that expires.** Batches with best-before dates, "use by" shown on the product page,
   discounts on short-dated stock, first-expiring-first-out when picking.
5. **Items sold by weight.** Price per kg; the amount authorised at checkout is an estimate, and the
   final charge is the weighed amount (Stripe manual capture, which is a nice interview topic). Money is still integer cents.
6. **Substitutions.** For each line: "best match", "this specific product" or "refund". The picker
   screen records what was substituted, and the customer accepts or rejects it at the door (or in the app).
7. **Food information.** Nutrition table, ingredients, the 14 EU allergens, dietary tags (vegan,
   gluten-free, organic) as search filters.
8. **Basket rules.** Minimum order value, a delivery fee by slot and area, a free-delivery threshold,
   bag fee, deposit on bottles.
9. **Picking and dispatch (admin).** A picker view per dark store: orders for the next slot, pick
   list sorted by aisle, weigh items, mark substitutions, hand to rider. The rider's progress is made up and shown on the tracking page.
10. **Repeat shopping.** "Your usuals", reorder last basket, lists ("Weekly shop"). Builds on Pawsome's reorder and wishlist.

Left out on purpose: alcohol and age checks, real maps or geolocation APIs (postcodes come from a
seeded table), real rider tracking, anything paid.

## Phases (draft; one small step = one commit, as in Pawsome)

| Phase | Goal |
| --- | --- |
| G0 Fork setup | Own ports (Postgres 5433, Mailpit 8026, web 5174, API 3001), compose project name, package names, README stub, fresh `docs/plan`, all checks green |
| G1 Strip pets | Remove everything in the table above, with migrations; checks green after every removal |
| G2 Brand and theme | "Grocery" wordmark, palette, logo (Gemini), tagline, tone of voice; new home layout for quick commerce |
| G3 Catalogue | Categories (Fresh, Bakery, Dairy & eggs, Pantry, Frozen, Drinks, Snacks, Household, Personal care, Baby), ~120 products, food information, images |
| G4 Areas and dark stores | Postcode table, areas, stores, stock per store, postcode gate in the UI (state in the URL) |
| G5 Delivery slots | Slot model, capacity, holds and their release job, slot picker, express option |
| G6 Weight and expiry | Batches and best-before, short-dated discounts, sold-by-weight items, manual capture |
| G7 Substitutions | Preferences per line, picker substitutions, customer accept or reject, partial refunds |
| G8 Picking and dispatch | Admin picker view, aisle sort, made-up rider status, tracking page |
| G9 Basket rules and repeat shopping | Minimum order, fees, thresholds, deposits, usuals, lists |
| G10 Testing, CI, deploy | e2e for postcode → slot → pay → substitute; deploy on free tiers without a card (as Pawsome) |
| G11 Polish and README | Case study write-up: the logistics decisions, with diagrams |

Each phase file (`phase-gNN-*.md`) gets written when its phase starts, in Pawsome's format: goal, a
"Learn / explain" section, then steps, each with a proposed commit message.

## Open questions (his to answer)

1. **Brand name:** decided, **Grocery**. Plain and descriptive on purpose: it's a portfolio demo,
   not a real brand. The logo and tagline do the work: a wordmark plus a line like "Groceries at your
   door in 30 minutes".
2. **Colour palette and mood.** Decided in G2.
3. **Language and currency.** Draft default: EUR, English + German (Pawsome's i18n already does both).
   Postcodes are Berlin-style, 5 digits.
