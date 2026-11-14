# Phase 6 — Auth and accounts

Goal: own session-based auth, hardened, plus the account area (profile, addresses, orders list
placeholder until phase 9).

## Step 6.1 — password hashing + session store
- `modules/auth/password.ts`: `hash()` / `verify()` with `argon2id` (memory 64 MB, time 3,
  parallelism 1 — document the choice). `modules/auth/sessions.ts`: `createSession(userId, meta)`
  (random 32-byte id), `getSession(id)` (joins user, checks expiry, slides expiry at most once per
  hour), `deleteSession`, `deleteOtherSessions(userId, keepId)`, `purgeExpired()` (called on login,
  cheap).
- Unit tests for hashing; integration for sessions.
- Learn / explain: why argon2id over bcrypt; session fixation (new id on login); sliding expiry.
- Commit: `feat(api): add password hashing and session store`

## Step 6.2 — cookie + auth middleware
- `lib/cookies.ts`: `setSessionCookie(res, id)` / `clearSessionCookie` — httpOnly, SameSite=Lax,
  Secure when prod, path `/`, maxAge 30 d. `middleware/auth.ts`: `attachUser` (reads `sid`, loads
  session, sets `req.user` or null — never errors), `requireUser`, `requireAdmin`.
- Commit: `feat(api): add session cookie and auth middleware`

## Step 6.3 — register / login / logout / me
- Shared schemas `RegisterSchema` (password ≥ 10 chars, checked against a small common-password list
  — no complexity rules, explain NIST guidance), `LoginSchema`, `UserSchema` (never includes hash).
- Register: 409 on existing email (same message as login failure? No — registration can reveal
  existence; document the trade-off, keep it simple: 409 `CONFLICT`). Login: dummy hash verify on
  unknown email (constant time), rate limit 10/15 min. Both call `cartService.mergeGuestCart` (phase 7 —
  leave a TODO hook `onLogin(userId, req)` here).
- Integration tests: full flow, wrong password, rate limit, cookie flags.
- Commit: `feat(api): add register, login, logout and me endpoints`

## Step 6.4 — account endpoints
- `PATCH /account`, `POST /account/password` (verifies current, revokes other sessions), addresses CRUD
  with ownership checks and "one default per kind" logic in a transaction.
- Tests incl. user A cannot touch user B's address.
- Commit: `feat(api): add account and address endpoints`

## Step 6.5 — web: auth state
- `features/auth/AuthProvider.tsx`: `useQuery(['me'])` on boot; `useAuth()` returns `{user, status}`.
  `RequireAuth` route wrapper (redirects to `/login?next=`), `RequireAdmin`.
- `api/auth.ts`. Header account menu switches between "Sign in" and name + menu.
- Commit: `feat(web): add auth state and route guards`

## Step 6.6 — web: login + register pages
- React Hook Form + Zod resolvers with the shared schemas. Inline errors, server error mapping
  (`VALIDATION_ERROR` details → fields), `next` redirect, password visibility toggle, autocomplete
  attributes (`email`, `new-password`, `current-password`).
- Tests: form validation; e2e register → logout → login.
- Commit: `feat(web): add login and register pages`

## Step 6.7 — web: account area
- `/account` layout with side nav: Profile (edit names), Security (change password), Addresses
  (list, add, edit, delete, set default), Orders (placeholder list reading `/account/orders`, which
  returns empty until phase 9).
- Commit: `feat(web): add account pages`

Phase 6 done when: he can explain the cookie flags, the CSRF story, argon2 params and session
revocation in an interview; tests cover ownership and rate-limit.
