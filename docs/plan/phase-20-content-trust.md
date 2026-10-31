# Phase 20 — Content & trust

Goal: turn the storefront into a believable brand: a richer homepage, trust signals, pet-care guides, a searchable help centre, public order tracking, legal pages, and safety notices.

## Learn / explain
- Content as data: why guides and help articles live in Postgres (admin-editable, searchable, linkable to products) but are authored as Markdown files and seeded.
- Postgres full-text search (`tsvector`, GIN index, `websearch_to_tsquery`) instead of a search service.
- Public lookups without login: proving ownership with order number + email, and not leaking whether an order exists (same answer for "wrong email" and "no such order"), plus rate limiting.
- Honest consent: the banner says only necessary cookies are used today; what "necessary" means under the EU rules, and why no analytics code loads before a choice exists.
- Sanitised Markdown rendering (no raw HTML) and why.

## Step 20.1 — content tables + seed pipeline
- Tables `guides`, `guide_categories`, `guide_products`, `help_articles`, `testimonials` (see Schema). Money-free, slugs unique.
- Seed reads `apps/api/content/guides/*.md` (front matter: title, slug, category, summary, product slugs, publishedAt) and `content/help/*.md`; upsert by slug so re-seeding is safe. Ship 10 short placeholder guides + 20 help articles; the cheap-model writing pass later only replaces these files.
- Tests: seed twice is idempotent; front matter validated by Zod, bad file fails the seed loudly.
- Commit: `feat(api): add content tables and markdown seed pipeline`

## Step 20.2 — guides API + web
- `GET /guides` (category, page), `GET /guides/:slug` (body, linked products, 3 related by shared category then recency), categories list.
- Web: `/guides`, `/guides/:slug` (reading time, linked-product cards using the existing product card, related guides, `<Seo>` with article metadata), `data-testid` on cards. Markdown via `react-markdown` **needs his OK** (small, no raw HTML by default); rejected: hand-rolled parser.
- Tests: unknown slug 404; unpublished guide hidden; related excludes itself.
- Commit: `feat(web): add pet-care guides`

## Step 20.3 — help centre with search
- `help_articles` has `topic` (shipping, returns, payments, accounts), `question`, `answer_md`, `search` tsvector (generated column). `GET /help?topic=&q=` returns ranked hits with a highlighted snippet (`ts_headline`).
- Service function `searchHelp(q, topic)` is pure of HTTP and the web client is `searchHelp({q, topic})` in `apps/web/src/api/help.ts`: these two names are the contract phase 24's agent tool calls unchanged; response schema lives in `@store/shared`. (Per-product Q&A is a different thing: phase 16 `product_faqs`.)
- Web `/help`: search box (debounced, URL state `?q=`), topic tabs, accordion with `aria-expanded`, "no result" state offering contact.
- Tests: ranking puts a title match first; empty query lists by topic; SQL special characters are safe.
- Commit: `feat(web): add help centre with search`

## Step 20.4 — public order tracking
- `POST /orders/track` `{ orderNumber, email }` returns status, items (names, qty), carrier/tracking number if present, and a timeline from `order_status_history`, labelled through shared `ORDER_STATUS_LABELS` (phase 14; phases 22 and 23 add `awaiting_vet_approval` and `ready_for_pickup`). No address, no payment data. Case-insensitive email compare; wrong pair and unknown order both return the same 404. Rate limit 10/hour/IP.
- Web `/track-order` (also linked from the confirmation email and footer); the timeline is a labelled `<ol>`.
- Tests: wrong email 404 identical body to unknown order; no PII in payload; rate limit 429.
- Commit: `feat: add public order tracking`

## Step 20.5 — footer, legal pages, withdrawal form, cookie banner
- Footer: link columns (shop, guides, help, company, legal), payment-method note, `track()` on link groups.
- Static pages from one `LegalPage` component with Markdown in `apps/web/src/content/legal/`: About, Shipping, Returns, Privacy, Terms, Cookies, Accessibility statement. Copy is generic fictional text with a visible "demo store, fictional company" line; not legal advice.
- EU withdrawal: "Withdraw from contract" in the footer and on the order page → `/withdraw` (order number, email, optional items, reason). `POST /withdrawals` stores a row in `withdrawal_requests`, emails an acknowledgement (durable medium) with timestamp, and shows the admin a queue (step 20.8). Reuses the 20.4 ownership check.
- Cookie banner: honest text, "We only use cookies that are strictly necessary (session, cart). No analytics or marketing cookies are set." Buttons: "OK" and "Cookie details". The choice is stored in `localStorage` (not a cookie) key `pawsome_consent_v1`; a `consent.ts` module exposes `hasConsent(category)`, returning false for non-necessary ones, so later phases (analytics) must ask before loading.
- Tests: withdrawal creates row + Mailpit mail; banner shows once; `hasConsent('analytics')` is false.
- Commit: `feat(web): add footer, legal pages, withdrawal form and cookie notice`

## Step 20.6 — safety notices (recalls)
- `safety_notices` (title, body_md, severity `info|warning|recall`, starts_at, ends_at, status) and `safety_notice_variants` (notice → variant ids). `GET /safety-notices/active`; product detail response gains `safetyNotices[]` for notices touching its variants.
- Web: dismiss-per-session banner at the top of the homepage for active notices; a notice box on affected PDPs (not dismissible). `role="alert"` only for severity `recall`.
- Email past buyers: `POST /admin/safety-notices/:id/notify` finds distinct emails from paid orders containing affected variants, queues one email each (idempotent: `notified_at` per notice+email in `safety_notice_deliveries`). Uses the phase 9 mailer; locally Mailpit.
- Tests: expired notice not returned; notify twice sends once; guest-order emails included.
- Commit: `feat: add product safety notices`

## Step 20.7 — richer homepage
- Sections in order: hero carousel, trust bar, shop by pet (every top-level pet category from the API, six after phase 14), bestsellers (phase 14's Bestseller query, with a seeded fallback), promo tile (admin text + link, optional), `seasonal` slot (phase 14's `SeasonalCollectionSlot`), guides teaser (3 latest), testimonials with aggregate rating, then registered slots `recently-viewed` (phase 16), `customer-gallery` (phase 17), `newsletter` (phase 19).
- **This phase owns the homepage.** `apps/web/src/features/home/slots.ts` is a tiny `HomeSlot` registry (`id`, `render`, `enabled`) with a fixed ordered id list (`seasonal`, `recently-viewed`, `customer-gallery`, `newsletter`); later phases only register their component and never edit `HomePage`. An unregistered slot renders nothing (no gap). Hero images and guide covers come from the phase 14.4 image pipeline (lead agent, browser).
- Hero carousel: 3 slides, autoplay off when `prefers-reduced-motion`, pause/play button, prev/next, slide-position dots as buttons, `aria-roledescription="carousel"`, pauses on hover/focus, no layout shift (fixed aspect ratio).
- `GET /home` returns bestsellers + promo + hero slides in one call (one query function, cached 60s).
- Tests: registry order is fixed regardless of registration order; carousel pause button stops rotation; reduced motion starts paused; missing optional slots leave no empty gaps.
- Commit: `feat(web): rebuild homepage with sections and slots`

## Step 20.8 — admin screens
- Admin pages: guides (Markdown editor with live preview, status, linked products picker), help articles, testimonials, safety notices (with notify button + delivery count), withdrawal queue (status `new|acknowledged|done`), hero slides + promo tile (a small `home_content` row set).
- Commit: `feat(web): add admin content management`

## Step 20.9 — e2e
- Visit homepage, pause the carousel, open a guide and click a linked product, search the help centre, track a seeded order by number + email (and a wrong email shows the generic message), submit a withdrawal, see the consent banner once.
- Commit: `test(e2e): add content and trust flows`

Phase 20 done when: the homepage and the new pages render from seeded content, a guest can track an order and withdraw from a contract, safety notices reach PDPs and past buyers, and the admin can edit all of it.

## Schema & API changes
Migration `00XX_content_trust`.
- New tables: `guide_categories`, `guides` (slug, title, summary, body_md, category_id, cover_url, status, published_at), `guide_products` (guide_id, product_id), `help_articles` (+ generated tsvector, GIN index), `testimonials` (name, pet, rating 1-5, quote, is_featured), `safety_notices`, `safety_notice_variants`, `safety_notice_deliveries`, `withdrawal_requests`, `home_content` (key, json).
- Public endpoints: `GET /home`; `GET /guides`, `GET /guides/:slug`, `GET /guide-categories`; `GET /help`; `GET /testimonials`; `POST /orders/track` (none, rate limited); `POST /withdrawals` (none, rate limited); `GET /safety-notices/active`.
- Admin endpoints: CRUD under `/admin/guides`, `/admin/help-articles`, `/admin/testimonials`, `/admin/safety-notices` (+ `POST /:id/notify`), `/admin/withdrawals` (list, PATCH status), `PUT /admin/home-content/:key`.
- Needs his OK: `react-markdown` (web), `gray-matter` (api, front matter parsing).

## Touches shared files
`apps/web/src/routes.tsx`, Header (no change) and Footer (rewritten here), homepage (rewritten here; phases 14, 16, 17, 19 plug in through `HomeSlot`), `packages/db schema index`, seed index, product detail response (adds `safetyNotices`), admin nav, `Seo` (adds article type).
Depends on: phase 14 (hard: Bestseller query, `SeasonalCollectionSlot`; merge after it). Phases 16, 17, 19 register their slots into this phase's registry. Feeds phase 24 (`searchHelp`).
