# Phase 17 — Reviews & customer photos

Goal: trustworthy social proof: verified reviews with pet context, moderated, photo-capable, plus a shoppable customer gallery.

## Learn / explain
- Aggregates: denormalised `rating_count`/`rating_sum` on products, kept in sync in the same transaction as moderation (vs `AVG()` on every card).
- Trust signals: why "verified buyer" is computed server-side from a paid order, never sent by the client.
- Safe file upload: size/type limits, magic-byte sniffing, re-encoding, random filenames, never trusting the client's name or MIME.
- Moderation as a state machine (`pending -> approved | rejected`) and why public queries only ever see `approved`.
- Keyword extraction: tokenise, drop stopwords, count document frequency, threshold. No AI service.

## Step 17.1 — schema + shared types
- Tables `reviews`, `review_photos`, `review_votes`, `gallery_photos` (see bottom). Unique `(user_id, product_id)`. Shared Zod: `reviewInputSchema` (rating 1-5 int, title 3-80, body 20-2000, pet fields optional with sane ranges, `wouldRecommend` boolean).
- Pet weight in integer grams, pet age in integer months (no floats).
- Commit: `feat(api): add review and gallery schema`

## Step 17.2 — review service: create, verified-buyer, one per product
- `POST /products/:slug/reviews` (auth). `verified_buyer` = EXISTS order line for that product on an order where shared `isPaidOrLater(status)` (phase 14) is true. Duplicate -> 409. New reviews start `pending`.
- Rate limit via existing `middleware/rate-limit.ts`: 5 reviews/hour/user, 30 votes/hour.
- Text is stored raw and rendered as text by React (no `dangerouslySetInnerHTML`).
- Tests: unverified user gets `verified=false`; duplicate 409; unauthenticated 401; rate limit 429.
- Commit: `feat(api): add review submission with verified buyer`

## Step 17.3 — photo upload (decision: local disk, honest limits)
- No object storage in the stack. Decision: `multipart` upload (small library `multer`, **needs his OK**; alternative: accept base64 JSON and parse by hand, rejected as memory-hungry), max 3 photos, 3 MB each, JPEG/PNG/WebP only (magic-byte check), re-encoded and resized to max 1200px with `sharp` (**needs his OK**, free, native dep; rejected alternative: store originals untouched, which leaks EXIF GPS).
- Stored under `apps/api/uploads/reviews/<uuid>.webp`, served by `express.static`. `UPLOAD_DIR` in `.env.example`.
- Honest limitation, written in the code comment and the decision log: Render's free tier has an ephemeral disk, so uploads vanish on redeploy. Prod alternatives (all free tiers, none adopted without his OK): Cloudflare R2, Supabase Storage. Until then the public demo seeds photos as committed static files under `/reviews/` and disables live upload when `UPLOADS_ENABLED=false`.
- Tests: wrong type rejected, 4th photo rejected, EXIF stripped, oversize 413.
- Commit: `feat(api): add review photo upload to local disk`

## Step 17.4 — public read API: list, breakdown, helpful votes
- `GET /products/:slug/reviews?sort=helpful|newest|photos&rating=&page=` (approved only) returns items, star breakdown (counts 1..5), `% would recommend` (integer, rounded in SQL), and topic chips.
- `POST /reviews/:id/helpful` (auth, one vote per user, own review -> 403, toggle on repeat).
- Topic chips: `topics.ts` pure function: lowercase, strip punctuation, stopword list, unigrams and bigrams, keep those in >= 3 distinct approved reviews, top 8. Recomputed on read with a 5 min in-memory cache per product.
- Commit: `feat(api): add review listing, breakdown and helpful votes`

## Step 17.5 — aggregate rating on cards and PDP data
- `products.rating_count`/`rating_sum` updated in the approve/reject/delete transaction. Catalog list/detail DTOs gain `rating: { count, averageTenths }` (average in tenths as integer; UI formats `4.6`). Sorting by rating is out (belongs to the discovery phase).
- Tests: approve increments, reject of previously approved decrements, never negative.
- Commit: `feat(api): expose aggregate rating on catalog`

## Step 17.6 — admin API: moderation + gallery
- `GET /admin/reviews?status=pending`, `POST /admin/reviews/:id/approve|reject` (reason), `DELETE /admin/reviews/:id`. Audit log lines as phase 10.
- Gallery: CRUD `/admin/gallery` (image path, caption, pet name, linked product ids, sort order, published flag).
- Email to the reviewer on approve (Mailpit locally): thank-you.
- Commit: `feat(api): add review moderation and gallery admin endpoints`

## Step 17.7 — web: reviews section on PDP
- `apps/web/src/features/reviews/`: `RatingStars` (accessible, `aria-label="4.6 out of 5"`), `StarBreakdown` bars, `RecommendBadge`, `TopicChips` (click filters list), sort/filter bar with state in the URL (`?rsort=&rstar=`), `ReviewCard` (verified tag, pet context line, photos with lightbox, helpful button), pagination.
- `ReviewForm` (RHF + Zod, photo picker with preview, "pending moderation" confirmation). Login prompt if signed out. Stars also on `ProductCard`, and in the PDP `<Seo>` JSON-LD `aggregateRating` only when count > 0.
- `track('review_submitted')`, `track('review_helpful')`. API calls only in `src/api/reviews.ts`.
- Commit: `feat(web): add reviews section and review form`

## Step 17.8 — web: admin moderation + gallery screens
- `/admin/reviews` queue (approve/reject with reason, photo preview, bulk approve) and `/admin/gallery` (upload, link products, reorder, publish). Routes in `routes.tsx`, `noindex`.
- Commit: `feat(web): add admin review moderation and gallery`

## Step 17.9 — shoppable gallery (#RealPawsomePets)
- `ShoppableGallery` component: masonry grid; click opens a modal with the photo, caption and the linked products (add to cart without leaving). On the homepage (registered as the `customer-gallery` `HomeSlot`, phase 20 owns the registry) and PDP (photos linked to that product). Hidden if empty.
- Commit: `feat(web): add shoppable customer gallery`

## Step 17.10 — seed + e2e
- Seed ~60 fictional reviews across products (mixed ratings, some pending, a few with pet context, committed placeholder photos generated by the lead agent through the phase 14.4 image pipeline, licences in `CREDITS.md`), 12 gallery photos.
- e2e `reviews.spec.ts`: buyer submits review with photo -> admin approves -> appears on PDP with verified tag -> helpful vote -> sort by photos -> gallery item opens modal and adds product.
- Commit: `test(e2e): add reviews and gallery flow`

Phase 17 done when: a buyer's review passes moderation, shows stars on cards and PDP with breakdown, chips and photos, and the gallery sells; the upload limitation is documented.

## Schema & API changes
Migration `00XX_reviews_ugc`:
- `reviews(id, product_id, user_id, order_id null, rating smallint 1-5, title, body, verified_buyer bool, pet_age_months int null, pet_weight_g int null, size_purchased text null, would_recommend bool, status enum('pending','approved','rejected'), reject_reason null, helpful_count int default 0, created_at, moderated_at)` unique `(user_id, product_id)`; index `(product_id, status, created_at)`.
- `review_photos(id, review_id, path, position)`; `review_votes(review_id, user_id)` PK both.
- `gallery_photos(id, path, caption, pet_name, sort_order, published)` + `gallery_photo_products(photo_id, product_id)`.
- `products` + `rating_count int`, `rating_sum int` default 0.

Endpoints:
- GET `/products/:slug/reviews` public: approved list, breakdown, chips.
- POST `/products/:slug/reviews` auth, multipart: create pending review.
- POST `/reviews/:id/helpful` auth: toggle vote.
- GET `/gallery?productId=` public: published photos with products.
- GET `/admin/reviews`, POST `/admin/reviews/:id/approve|reject`, DELETE `/admin/reviews/:id` admin.
- GET/POST `/admin/gallery`, PATCH/DELETE `/admin/gallery/:id` admin.

## Touches shared files
`apps/api/src/db/schema/index.ts`, seed index, catalog DTOs (`packages/shared`), `routes.tsx`, admin side nav, `ProductCard`, PDP page, homepage, `app.ts` (static uploads), `.env.example`.

## Needs his OK
New libraries `multer` and `sharp`; any prod image storage (R2/Supabase) beyond the demo's static seed photos.
