# Phase 10 — Admin

Goal: a small but real back office under `/admin`, role-protected, enough to run the demo store.

## Step 10.1 — admin API: stats + guards
- `requireAdmin` on the whole `/admin` router; audit log line for every admin mutation (request id,
  user id, action). `GET /admin/stats`.
- Commit: `feat(api): add admin router with stats`

## Step 10.2 — admin API: products, variants, images, inventory
- CRUD per contract. Create/update product with nested variants in one transaction; slug generated
  from name with uniqueness suffix; image management = URLs + alt (upload is **out**: say why — no
  object storage in the stack; admin pastes a path under `/products/`). Inventory set with a reason,
  recorded in a new small table `inventory_adjustments` `(id, variant_id, delta, reason, actor,
  created_at)` → migration 0005 here (also listed in `01-data-model.md`).
- Tests: non-admin 403; create with duplicate SKU 409; stock set below reserved rejected.
- Commit: `feat(api): add admin product and inventory endpoints`

## Step 10.3 — admin API: orders + customers
- List with filters, detail, `transition` using the phase 9 state machine, customers list.
- Commit: `feat(api): add admin order and customer endpoints`

## Step 10.4 — web: admin shell
- `/admin` layout (side nav, `RequireAdmin`), dashboard with stats tiles, `noindex`.
- Commit: `feat(web): add admin shell and dashboard`

## Step 10.5 — web: products
- Table with search/status filter; product form (RHF + Zod): fields, attributes editor (key/value
  list), variants table inline (options, SKU, price, weight, stock), images list. Create + edit.
- Commit: `feat(web): add admin product management`

## Step 10.6 — web: orders
- Table (status filter, search), detail with transition buttons that only show allowed next states,
  note field, history timeline, link to Stripe dashboard (`https://dashboard.stripe.com/test/payments/<pi>`).
- Commit: `feat(web): add admin order management`

## Step 10.7 — e2e
- Admin logs in → changes stock to 0 → storefront PDP shows sold out (after cache window; test sets
  `Cache-Control` off in test env) → admin marks order shipped → customer sees "shipped" and Mailpit
  has the email (local only).
- Commit: `test(e2e): add admin flows`

Phase 10 done when: the demo store can be fully managed without touching the DB.
