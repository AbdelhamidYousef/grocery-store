# Phase 1 — Database schema, migrations, seed

Goal: the whole data model from `01-data-model.md` exists as Drizzle schema + SQL migrations, with
idempotent seed data and a typed DB client. Nothing is exposed over HTTP yet.

## Step 1.1 — Drizzle setup
- Deps in api: `drizzle-orm`, `postgres` (porsager), dev `drizzle-kit`. `drizzle.config.ts` pointing
  at `src/db/schema/*.ts`, out `src/db/migrations`, dialect postgresql.
- `src/db/client.ts`: creates the `postgres()` connection from `DATABASE_URL` (`max` 10, `idle_timeout`),
  exports `db = drizzle(sql, { schema })` and `closeDb()`.
- `src/config/env.ts`: Zod-parse `process.env` once; crash on startup if invalid (fail fast).
- Migration 0000: `CREATE EXTENSION IF NOT EXISTS citext;` and the `set_updated_at()` trigger function
  (hand-written SQL via `drizzle-kit generate --custom`).
- Acceptance: `pnpm --filter api db:migrate` applies 0000 to the local DB.
- Learn / explain: migrations as the source of truth for prod; `drizzle-kit generate` vs `push` (never
  `push` outside local experiments); why validate env at boot.
- Commit: `feat(api): add drizzle client, env validation and base migration`

## Step 1.2 — enums + users, sessions, addresses
- `schema/users.ts`, `schema/sessions.ts`, `schema/addresses.ts` exactly per data model, incl. partial
  unique indexes for default addresses (Drizzle `uniqueIndex().where()`).
- Generate migration 0001, **read the SQL**, apply.
- Repo-level smoke test (`db.test.ts`): insert user, insert session, cascade delete.
- Learn / explain: `citext`; partial unique indexes; `on delete cascade` consequences.
- Commit: `feat(api): add users, sessions and addresses tables`

## Step 1.3 — catalog tables
- `categories`, `products` (with `attributes jsonb`, generated `search_vector` column — Drizzle
  supports `generatedAlwaysAs`; if not for tsvector, write it in a custom migration), `product_variants`
  (unique `(product_id, options)`), `product_images`, `inventory`.
- GIN indexes on `search_vector` and `attributes`.
- Migration 0002. Test: insert product + variants, query by `to_tsquery`.
- Learn / explain: generated columns; GIN vs B-tree; why `options jsonb` is unique per product.
- Commit: `feat(api): add catalog tables with full-text search`

## Step 1.4 — cart and shipping tables
- `carts`, `cart_items`, `shipping_methods`. Partial unique index "one active cart per user".
- Migration 0003. Test: second active cart for same user is rejected.
- Commit: `feat(api): add cart and shipping method tables`

## Step 1.5 — order, payment, webhook, history tables
- `orders` (+ `order_number_seq` sequence and the total check constraint), `order_items`, `payments`,
  `webhook_events`, `order_status_history`.
- Migration 0004. Test: order totals check constraint rejects a bad total.
- Learn / explain: snapshot columns (why order items don't just reference the variant); check
  constraints as a last line of defence.
- Commit: `feat(api): add order, payment and webhook tables`

## Step 1.6 — seed data
- `src/db/seed/{index.ts, categories.ts, products.ts, shipping.ts, users.ts}`. Product data as plain
  TS objects (about 40 products across 5 pets, see data model). Images: pick, download and resize to
  1200×1200 + 600×600 WebP with `sharp` (dev dep in a script, not runtime); write `CREDITS.md` with
  source URL + licence per image. Argon2 hashing for the seed users (dep arrives here: `argon2`).
- Idempotent upserts on `slug`/`sku`/`email`; prints the demo credentials at the end.
- `pnpm db:reset` = drop + migrate + seed (local only, guarded by `NODE_ENV !== 'production'`).
- Acceptance: run twice, no duplicates; counts match the plan.
- Learn / explain: `ON CONFLICT DO UPDATE`; why seeds are code, not SQL dumps; image licences.
- Commit: `feat(api): add idempotent seed data and product images`

## Step 1.7 — test database harness
- `src/test/setup.ts`: before all → run migrations on `DATABASE_URL_TEST`; before each → `TRUNCATE ...
  RESTART IDENTITY CASCADE` of all tables (simple and fast enough); helper factories
  `createUser()`, `createProduct({variants})`, `createCart()` in `src/test/factories.ts`.
- Vitest config: `globalSetup`, `fileParallelism: false` for integration tests (shared DB).
- Commit: `test(api): add database test harness and factories`

Phase 1 done when: `pnpm db:reset` gives a full store in the DB, all table tests green, he can draw
the entity map from memory.
