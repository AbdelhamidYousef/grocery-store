# Phase 5 — Catalog UI

Goal: home, category listing (PLP), search, product detail (PDP) — the pages a visitor sees.

## Step 5.1 — Home
- Hero (original copy + image), "shop by pet" tiles (5 colourful tiles, one per accent), "new
  arrivals" (products sorted newest, limit 8), a short "why Pawsome" content block. `track('view_home')`. `<Seo>`.
- Commit: `feat(web): add home page`

## Step 5.2 — ProductCard + ProductGrid
- Card: image with fixed aspect ratio (`width`/`height`, `loading="lazy"` below fold), name, price or
  price range, "Sold out" badge, compare-at price, whole card is one link. Grid 2/3/4 columns.
  Skeleton grid for loading.
- `track('view_item_list', {listId, items})` on mount.
- Commit: `feat(web): add product card and grid`

## Step 5.3 — PLP: list + URL state
- `/c/:slug` and `/search?q=`. **All list state lives in the URL** (`sort`, `page`, `minPrice`,
  `maxPrice`, `inStock`, `attr.*`) via `useSearchParams` — shareable, back-button friendly, and later
  SSR-able. Hook `useProductListParams()` parses with the shared query schema.
- Pagination component (prev/next + numbers), result count, empty state with "clear filters".
- Commit: `feat(web): add product listing with url-driven state`

## Step 5.4 — PLP: filters + sort UI
- Sidebar (desktop) / drawer (mobile) built from `facets`: checkbox groups per attribute key with
  counts, price range (two inputs, applied on blur/Enter), in-stock toggle. Sort select. Applied
  filter chips with remove. Debounce URL updates for price.
- Keyboard + screen reader: fieldset/legend per group; announce result count on change.
- Commit: `feat(web): add catalog filters and sort`

## Step 5.5 — Search box
- Header search navigates to `/search?q=`; on the search page the box keeps the query. Minimal
  suggestions **not** built (say why: keeps scope; could be a stretch).
- Commit: `feat(web): add search`

## Step 5.6 — PDP: layout + gallery
- `/products/:slug`: breadcrumbs, image gallery (thumbnails, main image, keyboard navigable, variant
  image swap), name, price for selected variant, attributes block (pet, material, age stage…), description, 404
  state. `<Seo>` with product name/description. `track('view_item')`.
- Commit: `feat(web): add product detail page`

## Step 5.7 — PDP: variant picker
- Built from `optionKeys` + variants: one group per option key (colour swatches for `color`,
  buttons for `size`/`flavour`, select for > 6 values).
  Selecting a combination resolves to a variant; combinations that don't exist are disabled; sold-out
  variants shown but disabled with label. Selected variant in the URL (`?variant=<sku>`) so links are
  precise. Default variant preselected.
- Unit tests for the resolver (pure function in `features/catalog/resolve-variant.ts`).
- Learn / explain: deriving UI from data (no hardcoded "colour/size").
- Commit: `feat(web): add variant picker`

## Step 5.8 — PDP: quantity + add to cart (button only)
- Quantity stepper (1..maxQty), "Add to cart" button that is disabled until phase 7 wires it; show
  low-stock hint ("Only a few left") from `lowStock`.
- Commit: `feat(web): add quantity stepper and add-to-cart placeholder`

## Step 5.9 — e2e
- Playwright: home → category → filter by material → open product → change variant → URL updated.
- Commit: `test(e2e): add catalog browsing flow`

Phase 5 done when: all catalog pages work on mobile and desktop with URL-driven state and pass the
a11y check; add-to-cart is the only dead button.
