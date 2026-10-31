# Plan 02 — API contract (every endpoint)

Base: `/api/v1`. JSON only. Responses: `{ data: ... }` on success, `{ error: { code, message,
details? } }` on failure. Pagination: `?page=1&limit=24` → `{ data: [...], meta: { page, limit,
total, totalPages } }`. All request/response shapes are Zod schemas in `packages/shared/src/schemas/`
and the API validates both input **and output** in dev/test (output validation catches drift).

Auth: cookie `sid` (httpOnly, Secure in prod, SameSite=Lax, path=/). Guest cart: cookie `cart_id`
(signed with `COOKIE_SECRET`). Mutating requests must send `Origin` matching `WEB_ORIGIN` (CSRF
check middleware) — simpler than tokens for a same-site SPA, and he can explain why it works
with SameSite=Lax.

Error codes (string enum in shared): `VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN`
403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `OUT_OF_STOCK` 409 · `CART_CHANGED` 409 · `RATE_LIMITED`
429 · `INTERNAL` 500.

## Health
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ status:'ok', db:'ok', version }`; DB ping with 1s timeout |

## Catalog (public, phase 3)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/categories` | tree, active products count per category |
| GET | `/categories/:slug` | category + children |
| GET | `/products` | query: `category`, `q` (full-text), `sort` (`relevance`,`price_asc`,`price_desc`,`newest`,`name`), `minPrice`,`maxPrice` (cents), `attr.<key>=v1,v2` (jsonb filter, e.g. `attr.material=plush,rubber`), `inStock=true`, `page`,`limit`. Returns list cards: id, slug, name, primary image, price range (min/max of active variants), `inStock`, attributes subset. Also returns `facets` (attribute values + counts for the current category) so the PLP filter UI is data-driven. |
| GET | `/products/:slug` | full product: variants (with available stock as boolean + `lowStock`, never the raw number), images, attributes, optionKeys, category breadcrumb |

### Catalog notes (written in phase 3)
- **Search (`q`)** is Postgres full-text (`websearch_to_tsquery('english', q)`): it matches word forms
  through stemming (`ropes` finds `rope`) and understands `"quoted phrases"`, `-exclusion` and `or`.
  It does **not** correct typos (`rpoe` finds nothing). Input of 1-2 characters (or only stop words)
  falls back to a case-insensitive substring match on the name. `sort=relevance` is the default when
  `q` is present, `newest` otherwise.
- Unknown query parameters are ignored; an unknown `category` gives an empty list, not a 404.

## Auth & account (phase 6)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | `{email, password, firstName, lastName}`; 201 + sets `sid`; merges guest cart |
| POST | `/auth/login` | — | rate-limited 10/15min per IP+email; constant-time on unknown email (hash a dummy) |
| POST | `/auth/logout` | user | deletes session row, clears cookie |
| GET | `/auth/me` | user | `{ user }` or 401; web calls this on boot |
| PATCH | `/account` | user | names |
| POST | `/account/password` | user | `{currentPassword, newPassword}`; revokes other sessions |
| GET/POST | `/account/addresses` | user | |
| PATCH/DELETE | `/account/addresses/:id` | user | ownership check |
| GET | `/account/orders` | user | paginated, newest first |
| GET | `/account/orders/:number` | user | ownership check |

## Cart (phase 7) — works for guest and user
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/cart` | creates guest cart on demand; returns re-priced cart: items (variant, product name, image, unitPrice, qty, lineTotal, `available`, `maxQty`), subtotal, itemCount, `warnings[]` (price changed, out of stock, qty clamped) |
| POST | `/cart/items` | `{variantId, quantity}`; upsert (adds to existing qty); 409 `OUT_OF_STOCK` if exceeds available |
| PATCH | `/cart/items/:id` | `{quantity}`; 0 deletes |
| DELETE | `/cart/items/:id` | |
| DELETE | `/cart` | clear |
| POST | `/cart/merge` | internal, called by login/register; not exposed to web |

## Checkout & payment (phase 8)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/checkout/shipping-methods` | query `country`; priced for current cart weight/subtotal |
| POST | `/checkout` | body `{ email, shippingAddress, billingAddress?, shippingMethodCode, notes? }` → validates cart (stock, prices), **creates order `pending_payment` + reserves stock + creates Stripe PaymentIntent (amount from server-side total, metadata.orderId)**, returns `{ orderNumber, clientSecret, totals }`. Idempotent per cart: re-calling with the same active cart updates the existing pending order/intent instead of creating another. |
| GET | `/checkout/orders/:number/status` | polled by the confirmation page until webhook flips status to `paid` (max 30 s, then shows "processing") |
| POST | `/webhooks/stripe` | raw body, signature verified with `STRIPE_WEBHOOK_SECRET`; handles `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`; idempotent via `webhook_events.id` |

## Admin (phase 10) — role `admin`
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/stats` | orders today / revenue 30d / low stock count |
| GET | `/admin/products` | all statuses, paginated, `q` |
| POST | `/admin/products` | create product with variants + images in one transaction |
| GET/PATCH | `/admin/products/:id` | |
| POST | `/admin/products/:id/variants` · PATCH/DELETE `/admin/variants/:id` | |
| PATCH | `/admin/inventory/:variantId` | `{ quantity }` absolute set, with reason → logged |
| GET | `/admin/orders` | filter by status, `q` on number/email |
| GET | `/admin/orders/:number` | with payment + history |
| POST | `/admin/orders/:number/transition` | `{ to, note }`; validated by the state machine |
| GET | `/admin/customers` | list + order count |

## Non-functional
- Every response has `X-Request-Id`; logs are JSON lines with the same id.
- Rate limit: 300 req / 15 min per IP globally, stricter on auth.
- Helmet defaults; CORS allows only `WEB_ORIGIN` with credentials.
- Timeouts: DB query 5 s, Stripe 10 s, whole request 15 s.
