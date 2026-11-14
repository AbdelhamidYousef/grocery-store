# Phase 3 — Catalog API

Goal: every public catalog endpoint from the contract, fast and tested, including search, filters,
facets, sorting, pagination.

## Step 3.1 — shared schemas for catalog
- `packages/shared/src/schemas/catalog.ts`: `CategorySchema`, `ProductCardSchema`,
  `ProductDetailSchema`, `VariantSchema`, `ProductListQuerySchema` (with coercion for numbers, enum
  for sort, `attr.*` parsing into a record), `PaginatedSchema(item)`. Export inferred types.
- Unit tests for the query schema (bad sort rejected, `attr.material=plush,rubber` → `{material:['plush','rubber']}`).
- Commit: `feat(shared): add catalog schemas`

## Step 3.2 — categories
- `modules/catalog/repo.ts` `listCategories()` (tree in one query + active product counts via lateral
  join or two queries), `getCategoryBySlug()`. Router: `GET /categories`, `GET /categories/:slug`.
- Integration tests with factories.
- Commit: `feat(api): add category endpoints`

## Step 3.3 — product list: base query + pagination + sort
- `listProducts(query)`: only `active` products; card projection with price range (`min(price)`,
  `max(price)` over active variants — subquery), primary image, `inStock` (exists variant with
  `quantity - reserved > 0`). Sort map. Count query for `meta.total`.
- Learn / explain: offset pagination vs keyset (offset is fine here, say why); `EXPLAIN ANALYZE` once
  to see the indexes used — put the output in the decisions log.
- Commit: `feat(api): add product list with sorting and pagination`

## Step 3.4 — filters
- `category` (include child categories), `minPrice`/`maxPrice` (on variant prices), `inStock`,
  `attr.<key>` (jsonb `@>` or `?|` per key, AND across keys, OR within a key). All via Drizzle `sql`
  fragments composed with `and()`.
- Tests for each filter and combinations.
- Commit: `feat(api): add product filters`

## Step 3.5 — full-text search
- `q` → `websearch_to_tsquery('english', q)` against `search_vector`; relevance sort uses `ts_rank`.
  Fallback `ILIKE` on name for 1–2 char input.
- Tests: "rope" finds the rope toys, "parrot" finds bird products via description; typo tolerance is **not** promised (say so in docs).
- Learn / explain: tsvector/tsquery, `websearch_to_tsquery` vs `plainto_tsquery`, ranking.
- Commit: `feat(api): add full-text product search`

## Step 3.6 — facets
- For the current category + `q` (but ignoring the attribute filters themselves, so counts stay
  useful): `jsonb_each_text(attributes)` grouped by key/value with counts, limited to keys listed in a
  `FACET_KEYS` constant (`pet`, `material`, `brand`, `ageStage`). Price min/max of the result set.
- Returned as `facets: { attributes: { material: [{value, count}] }, price: {min,max} }`.
- Commit: `feat(api): add catalog facets`

## Step 3.7 — product detail
- `getProductBySlug()`: product + variants (with `available: boolean`, `lowStock: boolean`, never the
  raw count), images ordered, breadcrumb (category + parent), `optionKeys`. 404 for draft/archived
  unless the requester is admin (admin check comes in phase 6; for now, 404).
- Commit: `feat(api): add product detail endpoint`

## Step 3.8 — caching headers
- `Cache-Control: public, max-age=60, stale-while-revalidate=300` on catalog GETs; `ETag` via
  Express default. Document that admin changes can lag up to 60 s publicly.
- Commit: `feat(api): add cache headers to catalog endpoints`

Phase 3 done when: he can run `curl` for every catalog case in the contract and the integration suite
covers each query parameter.
