# Contributing

Grocery is a portfolio project, so there is no roadmap to join, but fixes and suggestions are welcome as issues or pull requests.

## Set up

Follow [Local setup](README.md#local-setup) in the README. Node 22, pnpm and Docker are needed.

## Gates

Every commit must pass these, and CI runs the same checks:

```sh
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Run `pnpm e2e` before pushing a change that touches a user flow (it needs `docker compose up -d` and a migrated, seeded database). A git hook formats and lints staged files on commit.

## Commits

Conventional commits, scoped by workspace: `feat(api): add cart merge on login`, `fix(web): keep focus after route change`, `test(api): ...`, `docs: ...`, `chore(repo): ...`. One small step per commit. Say why in the body when it is not obvious.

## Branches and pull requests

- Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
- Keep a branch rebased on `main`; open a pull request when the gates pass.
- `main` is meant to be protected: pull request required, and the typecheck/lint/format, test, e2e and secret-scan checks green before merging.
- Changing the schema means a new migration (`pnpm --filter @store/api db:generate`); never edit an applied migration and never use `drizzle-kit push` outside a local experiment.
- Money is integer cents everywhere. No floats.
- Only Stripe test-mode keys (`sk_test_`, `pk_test_`) ever go in `.env`, and `.env` is never committed.
