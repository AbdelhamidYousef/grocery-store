# Phase 15 — Discovery & navigation

Goal: shoppers find the right product fast: mega-menu, search autocomplete, richer filters, pet profiles that
pre-filter the store, and a gift finder quiz. Assumes phase 14 (brands, collections, badges, health-need tags,
swatches, reptiles as 6th pet, ~120 products) is merged.

## Learn / explain
- **URL as state**: every filter, chip and quiz answer lives in the query string, so pages are shareable and
  back-button safe (the guard-rail from phase 5, now stress-tested with more filters).
- **ARIA combobox** and **disclosure navigation**: roles, `aria-activedescendant`, focus management, roving keys.
- **Debounce + request cancellation** (TanStack Query `signal`) so fast typing never shows stale results.
- **Guest-to-account merge** again (as with the cart): local state first, server state after sign-in.
- **Rule-based recommendation**: scoring against tags is explainable; no ML is needed for 120 products.

## Step 15.1 — pet profiles: API
- Table `pets` `(id, user_id, name, species (the shared `PET_VALUES` enum from phase 14: dog|cat|bird|fish|small|reptile), birthday date null,
  approx_age_months int null, size enum xs|s|m|l|xl null, created_at)`. Max 8 per user. Birthday is stored as a
  plain `date` (no timezone) because phase 19 reuses it for birthday emails.
- `GET/POST /account/pets`, `PATCH/DELETE /account/pets/:id` (ownership check). `POST /account/pets/merge`
  takes the guest's local pets on login and de-duplicates by name+species.
- Shared Zod `petSchema` and `petToFilters(pet)` in `packages/shared` (species, age stage from birthday, size →
  `attr.pet`, `attr.ageStage`, `attr.size`). Age stage thresholds per species live in one table, unit-tested.
- Tests: 403 on other user's pet; 9th pet rejected; birthday in the future rejected; `petToFilters` per species.
- Commit: `feat(api): add pet profiles`

## Step 15.2 — pet profiles: web
- `features/pets/`: `usePets()` (server when signed in, `localStorage` when guest), `ActivePetProvider`
  (active pet id persisted per visitor), add/edit pet form (RHF + Zod), `/account/pets` page.
- Header pet switcher: "Shopping for Biscuit" pill + menu (switch, add, "everyone"). Active pet applies
  `petToFilters` as the **default** of PLP params; the user can clear it with one click and the URL stays truthful
  (`?pet=<id>` is NOT used: the resolved filters are written to the URL, so a shared link works for others).
- Login merges guest pets via the merge endpoint; `track('pet_added' | 'pet_activated')`.
- Commit: `feat(web): add pet profiles and active pet`

## Step 15.3 — filters: price slider, in-stock, quick chips
- API already supports `minPrice/maxPrice/inStock`; extend `facets` with `priceMin/priceMax` (cents, current
  result set) and add `chips` ordering to the response. No new endpoints.
- Dual-handle price slider built from two native `<input type=range>` (keyboard + screen reader for free; no
  library), cents steps of 100, values shown with `formatMoney`, applied on release (not per tick).
- "In stock only" switch; quick-filter chips above the grid (brand, health need, on sale, "new") derived from
  `facets`, toggling URL params; active filters shown as removable chips + "Clear all".
- Tests: URL round-trip (load with params → UI reflects → change → URL updates); slider clamps min <= max.
- Commit: `feat(web): add price slider, stock toggle and quick filter chips`

## Step 15.4 — search suggest: API
- `GET /search/suggest?q=` (public, rate-limited 60/min/IP, min 2 chars, `Cache-Control: max-age=30`):
  `{ products[5], categories[3], brands[3] }`. Prefix match with `ILIKE` + trigram index (`pg_trgm`, bundled
  with Postgres, no new service) falling back to the existing tsvector. Return minimal fields (name, slug, thumb,
  price from) only.
- Tests: ranking (prefix before substring), archived/draft never leak, 1-char query -> 400.
- Commit: `feat(api): add search suggestions`

## Step 15.5 — search autocomplete UI
- `SearchCombobox` per WAI-ARIA 1.2 pattern: `role=combobox`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`, Up/Down/Home/End/Enter/Escape, results grouped with `role=group`, live-region count
  ("5 products, 2 brands"). Debounce 200 ms, aborts in-flight requests.
- Recent searches (last 6) in `localStorage`, shown on focus with empty input, per-item remove + "Clear".
  Never sent to the server (privacy, and no table needed). Wrapped in try/catch for blocked storage.
- Enter without selection goes to `/search?q=`; mobile: full-screen overlay with the same component.
- Commit: `feat(web): add search autocomplete`

## Step 15.6 — mega-menu
- Promo images come from the phase 14.4 image pipeline (lead agent, browser). Table `menu_promos` `(id, pet species|null, title, subtitle, image_url, image_alt, link, sort_order,
  active)`; `GET /navigation` returns `{ pets: [{ pet, categories[], brands[], promo }] }` (one cached call,
  built from the categories tree + phase 14 brands); admin CRUD under `/admin/menu-promos` + screen
  `/admin/navigation` (list, form, preview, reorder).
- Desktop: disclosure buttons (not hover-only; hover opens with 150 ms intent delay, click/Enter/Space toggles,
  Escape closes and returns focus, Tab leaves naturally, `aria-expanded`). Panel: category columns + featured promo
  tile. Mobile: drawer with accordion levels, focus trap, body scroll lock, 44 px targets.
- Outlier guard: panel max-height with internal scroll; a pet with >8 categories shows "See all".
- Commit: `feat: add mega-menu with promo tiles`

## Step 15.7 — gift finder quiz
- `/gift-finder`: 4 questions (who for: pet species or "a pet lover"; their size/age; budget band; occasion or
  interest: play, comfort, walks, treats). Config-driven in `packages/shared/src/gift-quiz.ts` (answers map to
  attribute filters + collection/tag boosts); changing questions is a code change (not admin: trivial, documented).
- Result page `/gift-finder/result?pet=dog&size=m&budget=2500&goal=play` = pure function of the URL: scored picks
  (max 6, each with a one-line "why" built from the matched tags), refine link, "copy link". Budget bands are
  integer cents; gift-wrap upsell reserved for phase 19.
- Tests: scoring unit tests (out-of-stock excluded, budget respected, ties stable); invalid params fall back to
  step 1; picks never empty (relaxes budget then size, says so).
- Commit: `feat(web): add gift finder quiz`

## Step 15.8 — e2e
- Search "chew" with keyboard only, pick a suggestion; open mega-menu via keyboard -> promo; guest adds pet
  "Biscuit", store pre-filters; set price range + in-stock, reload keeps state; finish the quiz, open the result.
- Commit: `test(e2e): add discovery flows`

Phase 15 done when: a shopper can reach a relevant product through menu, search, filters or quiz, entirely by
keyboard, and every state survives a reload via the URL (or per-visitor storage for pets and recents).

## Schema & API changes
- Migration `00XX_discovery`: tables `pets`, `menu_promos`; extension `pg_trgm` + trigram GIN indexes on
  `products.name`, `brands.name`, `categories.name`.
- `GET/POST /account/pets` (user), `PATCH/DELETE /account/pets/:id` (user), `POST /account/pets/merge` (user).
- `GET /search/suggest` (public), `GET /navigation` (public).
- `GET/POST /admin/menu-promos`, `PATCH/DELETE /admin/menu-promos/:id` (admin).
- Extended: `GET /products` facets (`priceMin`, `priceMax`, chips).

## Touches shared files
`routes.tsx` (gift-finder, account/pets, admin/navigation), `Header` (combobox, mega-menu, pet switcher),
admin nav, schema index, seed index, `packages/shared` index, PLP page (default filters), login flow (merge).

## Dependencies / needs his OK
Needs phase 14 (brands, tags, species, volume). Phase 19 reads `pets.birthday` (column name is final: `birthday`); phase 16 reads the active pet only through `petToFilters`. `pg_trgm` is a Postgres
built-in extension (confirm Neon allows it; it does on the free tier).
