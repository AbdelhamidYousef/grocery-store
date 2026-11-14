# Phase 2 — API foundation

Goal: the cross-cutting middleware every module will rely on, done once, tested once.

## Step 2.1 — request id + logging
- `middleware/request-id.ts`: use incoming `X-Request-Id` if present else `crypto.randomUUID()`;
  set on `res` and `req.id`.
- `lib/logger.ts`: Pino, pretty in dev (`pino-pretty` dev dep), JSON in prod, redact `req.headers.cookie`
  and `authorization`. `pino-http` with the request id as the child binding.
- Learn / explain: structured logs; redaction; why correlation ids matter across web → api → stripe.
- Commit: `feat(api): add request id and structured logging`

## Step 2.2 — errors
- `lib/errors.ts`: `AppError` + factories `notFound()`, `unauthenticated()`, `forbidden()`,
  `validation(details)`, `conflict(code)`. `middleware/error.ts`: maps `AppError` → status/body,
  `ZodError` → 400 with flattened issues, anything else → 500 with logged stack, generic body in prod.
  404 fallback handler for unknown routes. Never leak stack traces in prod.
- Tests for each mapping.
- Commit: `feat(api): add domain errors and error middleware`

## Step 2.3 — validation helper
- `lib/validate.ts`: `validate({ body?, query?, params? })` middleware factory from Zod schemas, puts
  parsed values on `req.valid`. Typed so handlers get inferred types. In non-prod also
  `respond(res, schema, data)` that validates the output.
- Commit: `feat(api): add zod request validation middleware`

## Step 2.4 — security middleware
- `helmet`, CORS (`cors` with `origin: WEB_ORIGIN`, `credentials: true`), `cookie-parser` with
  `COOKIE_SECRET`, body size limit 100 kB, `express-rate-limit` (global + a stricter factory for auth),
  CSRF origin check middleware for non-GET (`Origin`/`Referer` must match `WEB_ORIGIN`; skip for the
  Stripe webhook route).
- `trust proxy` = 1 in prod (Render sits behind a proxy; needed for correct IPs and Secure cookies).
- Tests: CORS preflight; mutating request with foreign origin → 403.
- Learn / explain: each header helmet sets; why origin-check CSRF is sufficient with SameSite=Lax; rate-limit keying.
- Commit: `feat(api): add security middleware`

## Step 2.5 — health with DB ping, graceful shutdown
- Health does `select 1` with 1 s timeout; reports `version` from package.json.
- `index.ts`: SIGTERM/SIGINT → stop accepting, close server, `closeDb()`, exit; 10 s hard timeout.
- Commit: `feat(api): add db health check and graceful shutdown`

## Step 2.6 — module wiring convention
- `src/modules/index.ts` mounts routers under `/api/v1`. Empty `catalog`, `auth`, `cart`, `checkout`,
  `admin` folders with a `router.ts` each exporting an empty router, so later phases only fill in.
- Update `.env.example`: `COOKIE_SECRET`, `RATE_LIMIT_*`.
- Commit: `chore(api): add module layout and router mounting`

Phase 2 done when: a bad JSON body, an unknown route, a foreign-origin POST and a DB outage each give
the right status and a logged line with a request id.
