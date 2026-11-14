# Phase 21 — Store views, languages & currencies

Naming: a **store view** is a language/currency storefront (this phase); a **store** is a physical shop (phase 23, `stores` table, `/stores` finder). Code, columns and headers here say `store_view`, `X-Store-View`, `GET /store-views` to avoid the clash.

Goal: the shop runs as several store views (`/eu-en/`, `/de-de/`, `/fr-fr/`, `/uk-en/`), each with its own
language, currency, shipping countries and tax display, without forking the code.

Built LATE (after phases 14–20) because it touches every UI string and every price. Build it in four
slices, each shippable alone: router prefix → strings → catalogue → currency.

## Learn / explain
- A **store view** is configuration, not code: `{code, locale, currency, countries, taxDisplay}`. Everything
  else (language, price, shipping, VAT label) is looked up from it.
- Locale lives in the URL (crawlable, shareable, cache-friendly), the cookie only remembers the last pick.
- `Intl.NumberFormat`, `Intl.PluralRules`, `Intl.DateTimeFormat` replace hand-written formatting; plurals are
  per-language rules (German 2 forms, French treats 0 and 1 as singular), never `n === 1 ? ... : ...`.
- Translations are data with a **fallback chain** (`de-DE → de → en`); a missing string never shows a key.
- Money stays integer cents. A second currency means a second **stored price**, never a conversion at runtime.

## Decisions (log each in `04-decisions-log.md`)
- **UI strings: tiny typed in-house dictionary** (`apps/web/src/i18n/`), keys typed from the English file so a
  missing key fails `typecheck`; plurals via `Intl.PluralRules`. Rejected: i18next/react-i18next (more
  features than a 4-language shop needs, extra bundle). Decided: no i18next.
- **Catalogue: one translation table per entity** (`product_translations`, ...). Rejected: JSONB column on
  the entity (no per-locale unique slug, hard to index/search, no FK per locale).
- **Prices: `variant_prices` table** `(variant_id, currency, price_cents, compare_at_cents)`. Rejected: live FX
  or a multiplier (rounding drift, prices like 19.37 look wrong).
- **Default store `eu-en`**; old URLs (`/c/x`, `/products/y`) 301-style redirect (client `Navigate replace`
  plus a Vercel rewrite/redirect rule) to the remembered store, else `eu-en`. Root `/` picks by cookie, then
  `Accept-Language`, then `eu-en`.
- Payments: the **fake gateway** takes the order's currency and amount; Stripe is not configured, so Stripe
  mapping is only noted (`currency` passed to PaymentIntent) and covered by unit test, not run live.

## Step 21.1 — store registry (shared)
- `packages/shared/src/stores.ts`: `STORES` const (typed) with `code`, `locale`, `lang`, `currency`,
  `shipCountries`, `taxDisplay: 'incl' | 'excl'` (EU/DE/FR incl. VAT, UK incl., all shown "incl. VAT").
  `storeFromCode()`, `DEFAULT_STORE`. Zod `storeCodeSchema`.
- Tests: every store has a currency supported by `formatMoney`; codes unique.
- Commit: `feat(shared): add store view registry`

## Step 21.2 — router prefix (SLICE 1)
- `routes.tsx`: wrap storefront routes in `/:store/*` with a `StoreLayout` that validates the code (invalid
  → NotFound), provides `StoreContext`, sets `<html lang>`. `/admin`, `/api` stay un-prefixed. Legacy paths
  redirect (see Decisions).
- `useStorePath()` / `<StoreLink>` helper; replace every raw `<Link to>` and `navigate()` (lint rule
  `no-restricted-imports` on `Link` from react-router-dom outside the helper).
- Tests: unit for redirect map; e2e smoke that `/products/x` lands on `/eu-en/products/x`.
- Commit: `feat(web): add store view URL prefix and legacy redirects`

## Step 21.3 — switcher + remembered choice
- Header and footer `StoreSwitcher` (select, `data-testid="store-switcher"`): swaps the prefix keeping the
  rest of the path and query. Cookie `pawsome_store` (1 year, `SameSite=Lax`, set client-side). `track()`
  event `store_switched`.
- `<Seo>` gets `alternates`: renders `<link rel="alternate" hreflang>` for every store plus `x-default`
  (no other SEO work).
- Tests: component test of path swap; e2e switch keeps the page.
- Commit: `feat(web): add store switcher and hreflang alternates`

## Step 21.4 — string extraction (SLICE 2)
- `apps/web/src/i18n/{en.ts,de.ts,fr.ts,index.tsx}`: `useT()` returns `t(key, params)` and
  `tn(key, count)` (plural forms `one/other`, plus `zero` where defined). Interpolation is `{name}`; no HTML
  in strings (use components for bold/links).
- Extract every hard-coded string in pages, components, validation messages and API error `code` → message
  map. Do it page by page in one commit, English first (behaviour must not change; snapshot tests prove it).
- Dates/numbers through `useFormat()` (`Intl` with the store locale). ESLint rule/regexp test flags JSX text
  literals in `features/` and `pages/`.
- Tests: key parity test (de/fr have exactly the keys of en); plural test for DE and FR.
- Commit: `refactor(web): extract UI strings into typed dictionary`

## Step 21.5 — translate UI strings
- Fill `de.ts`, `fr.ts` (a cheap model translates; he reviews a sample of 20). Add `uk-en` = `en` with UK
  spellings only where they differ (`colour`). Missing key falls back to English with a dev-only console warn.
- Commit: `feat(web): add German and French UI strings`

## Step 21.6 — catalogue translations: schema + API (SLICE 3)
- Tables `product_translations`, `category_translations`, `brand_translations`, `collection_translations`,
  `guide_translations` (all exist by now: phases 14 and 20 are merged before this one): `(entity_id, locale,
  name, slug, description, ...translatable fields, meta_title, meta_description)`, PK `(entity_id, locale)`,
  unique `(locale, slug)`. English stays in the base columns (the fallback, never null).
- Not translated in v1 (fall back to English, stated in the admin completeness report): help articles, legal pages, product specs/FAQs/size guides, reviews (user text), testimonials, safety notices.
- API: catalogue endpoints accept store via `X-Store-View` header (set by the api client from the URL, not a
  query param, so caching keys stay simple; `Vary: X-Store-View`), return translated fields with fallback per
  field. Search matches the active locale plus English. Slugs resolve per locale; a product opened under the
  wrong locale slug redirects to the right one.
- Tests: fallback per field; slug per locale; unique conflict 409.
- Commit: `feat(api): add catalogue translation tables and locale-aware reads`

## Step 21.7 — seed format and admin editing
- Seed: `apps/api/src/db/seed/translations/<locale>.json` shaped `{ "products": { "<sku-or-slug>": { name,
  description, slug } }, "categories": {...} }`; an `export-untranslated` script writes the English source
  with only the missing keys, so a cheap model fills a file and `db:seed` upserts it idempotently.
- Admin: locale tabs on product/category/brand/collection/guide forms, "copy from English" button, per-locale
  completeness badge in lists. Endpoints below.
- Tests: seed twice gives no duplicates; admin saves a German name and the DE storefront shows it.
- Commit: `feat(admin): edit catalogue translations per locale`

## Step 21.8 — multi-currency prices (SLICE 4)
- `variant_prices` migration; backfill one EUR row per variant from `price_cents`; later add GBP rows (seed
  with fixed hand-set values, e.g. 1999 EUR to 1699 GBP, not computed). DE/FR share EUR.
- Phase 14's `unit_price_asc` sort and unit price read the store-currency price. Flash-sale prices, member prices and `price_history` (phase 18) stay EUR-only in v1: in a GBP view sales and member prices simply do not apply (no strike-through, so Omnibus is never violated), logged as a decision. Pricing service reads the store currency; falls back to **no price available** (product hidden in that
  store) rather than converting. Admin variant form gets a price grid (one row per currency).
- Tests: no float anywhere (property test over seed prices); missing GBP price hides the variant in uk-en.
- Commit: `feat(api): add per-currency variant prices`

## Step 21.9 — cart, orders, promotions, shipping in currency
- `carts.currency` and `orders.currency` set from the store at creation; cart re-priced from that currency;
  switching store with a non-empty cart asks to confirm (cart is re-priced, or kept in its currency: pick the
  re-price, log it). Order snapshots `store_view`, `locale`, `currency`.
- Phase 18 `priceCart` gets `currency` and per-currency inputs from the service; the engine itself is unchanged. Phase 19 points/rewards are 1 point = 1 minor unit of the order currency, round-up donation is in order currency. Phase 22 refunds pass the order currency to the gateway; analytics (22.8) report per currency (currency filter, never summed across).
- Phase 18 promotions: thresholds/fixed amounts become `{currency: cents}` maps (free-shipping threshold per
  currency); percent rules unchanged. Shipping rates/countries filtered by the store's `shipCountries`.
- Fake gateway amount = order total in the order's currency; webhook simulate verifies currency match.
- `formatMoney(cents, currency, locale)` now takes the locale (`1.234,50 €` vs `€1,234.50`).
- Tests: UK cart totals in GBP; threshold per currency; mismatched currency rejected at payment.
- Commit: `feat(api): price carts, orders and promotions in store currency`

## Step 21.10 — emails in the order's language
- Templates from phases 17, 19, 22 and 23 (review approved, newsletter, stock alerts, returns, vet, ready for pickup, grooming) are included. `emails/*` take `locale`; templates read strings from an API-side dictionary (`apps/api/src/emails/i18n/`,
  same shape as the web one, shared plural helper in `packages/shared`). Subject, body, money and dates use
  the order's locale. Admin-triggered emails (shipped) use the order's stored locale, not the admin's.
- Tests: snapshot DE and FR confirmation; Mailpit e2e check on subject.
- Commit: `feat(api): send order emails in the order locale`

## Step 21.11 — e2e
- Spec `stores.spec.ts`: open `/de-de/`, German strings and `€` shown, switch to `/uk-en/`, prices in `£`,
  add to cart, checkout through the fake gateway, confirmation shows `£`, Mailpit mail in English.
- Commit: `test(e2e): add store view and currency flow`

Phase 21 done when: the same catalogue is browsable and purchasable in four store views with correct
language, currency and shipping, old URLs still work, and an untranslated field falls back to English.

## Touches shared files
`routes.tsx` (prefix wrapper), `Header` and `Footer` (switcher), `<Seo>`, every page/component (strings),
`formatMoney` in shared, schema index, seed index, api client (`X-Store-View` header), email templates, phase 18
promotion code. Lead: merge this phase LAST.

## Schema & API changes
Migration `00XX_store_views_i18n`:
- New: `product_translations`, `category_translations`, `brand_translations`, `collection_translations`,
  `guide_translations`, `variant_prices`.
- Columns: `carts.currency`, `carts.store_view`; `orders.store_view`, `orders.locale` (`orders.currency`
  exists); promotion threshold columns become jsonb currency maps (`00XX` data migration).
Endpoints:
- All catalogue reads: optional `X-Store-View` header (public), locale-aware fields.
- `GET /store-views` public: store view registry for the switcher.
- `GET /admin/translations/:entity/:id` admin: all locales of one entity.
- `PUT /admin/translations/:entity/:id/:locale` admin: upsert one locale, 409 on slug clash.
- `GET /admin/translations/missing?locale=de` admin: completeness report.
- `PUT /admin/variants/:id/prices` admin: replace the per-currency price list.
- `PATCH /cart` and `POST /checkout`: store taken from `X-Store-View`, currency validated.
