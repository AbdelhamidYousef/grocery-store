# Plan 03 — Conventions and definition of done

## Working rhythm (every step of every phase)
1. Read the step's "Learn / explain" links **before** coding.
2. Build the step. Keep it to the files the step names; if more is needed, say so first.
3. Run the gates (below). All green or explain why not.
4. Show the diff summary and the proposed commit message. **Commit only when he says.**
5. Append any decision made to `04-decisions-log.md`.
6. Nothing goes through HQ; he decides, and where he has delegated, the session decides and logs it.

## Gates (must pass before any commit)
```
pnpm typecheck      # tsc -b across workspaces, 0 errors
pnpm lint           # eslint, 0 errors, 0 warnings
pnpm format:check   # prettier
pnpm test           # vitest unit + integration (needs docker postgres up)
pnpm e2e            # playwright, only before pushing or at phase ends
```

## Code style
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes` off (too noisy for learning).
- ESLint: `@typescript-eslint` recommended-type-checked, `react-hooks`, `import/order`, no default exports except route components/pages.
- Prettier default, 100 cols, single quotes, trailing commas.
- Files `kebab-case.ts`; React components `PascalCase.tsx`; one component per file.
- API module shape: `router.ts` (http only) → `service.ts` (business rules, transactions) → `repo.ts` (Drizzle queries). Router never touches `db`; repo never throws domain errors.
- Domain errors are classes in `apps/api/src/lib/errors.ts` (`AppError(code, status, message, details)`); the error middleware is the only place that turns them into HTTP.
- Money: `packages/shared/src/money.ts` — `formatMoney(cents, currency)`, `sumCents`. No arithmetic on floats, ever.
- Comments explain **why**, not what. Each non-obvious design choice gets a 1–3 line comment at the spot (the hub is untracked, so the reasoning must live in the code).
- No `any`. No `// @ts-ignore`. `unknown` + narrowing.

## Testing rules
- Unit (Vitest): pure functions, services with repo mocked **only** when the DB would be noise.
- Integration (Vitest + Supertest): hit `createApp()` against a real Postgres `ecommerce_test` DB; each test file runs in a transaction rolled back after each test, or truncates. Covers every endpoint's happy path + the auth/validation failures.
- E2E (Playwright): browse → PDP → add to cart → checkout with Stripe test card `4242 4242 4242 4242` → confirmation page shows `paid` (webhook forwarded by `stripe listen` locally; in CI, the test calls a `/test/webhooks/simulate` endpoint that only exists when `NODE_ENV=test`).
- Test names read as sentences: `it('rejects quantity above available stock')`.
- Stripe is never mocked at the HTTP level in integration tests of the checkout service; use the real test API with a secret from `.env.test` (skipped if absent, with a loud warning).

## Commit style
Conventional commits, scoped by workspace: `feat(api): add cart merge on login`, `chore(repo):`,
`test(web):`, `docs:`. One step = one commit. Body says *why* when not obvious. Attribution line as
the session's reminder requires.

## Definition of done — per phase
- Every step's acceptance criteria met and demonstrated (screenshot or test output).
- Gates green. New tests for new behaviour.
- `.env.example` updated if a variable was added.
- He can explain each new piece in one minute without notes (do a quick verbal check at phase end: the session asks him 3 questions, he answers).
- Decisions log updated.

## Definition of done — whole project
- Deployed demo URL works end to end with test card.
- README is a case study (phase 13).
- `pnpm install && docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev` works on a fresh clone in under 10 minutes following the README only.
- Lighthouse accessibility ≥ 95 on home, PLP, PDP, cart, checkout (not a CWV target, just hygiene).
- No secrets in git history (`gitleaks detect` run once before first push).
