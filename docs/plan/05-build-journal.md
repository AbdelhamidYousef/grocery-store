# Build journal

What was built per step and why, for the owner to read; quiz questions per phase at the end of each phase section.

## Phase 0 — Bootstrap

### 0.1 — git init, ignore, node version
The repository was initialised on `main` with a pinned Node major (`.nvmrc` = 22) and an `.editorconfig` so every editor produces the same whitespace. The existing `.gitignore`, `CLAUDE.md` and `docs/plan/` were picked up as they were. Why `.env.*` is ignored but `.env.example` is force-included: real env files hold secrets and must never be committed, so a wildcard blocks every variant; the `!.env.example` exception lets the one file that documents variable names (without values) stay tracked so a fresh clone knows what to set.

### 0.2 — pnpm workspace + root package.json
The root `package.json` is private and only holds scripts, the pinned `packageManager` (pnpm 12.16.1) and TypeScript; `pnpm-workspace.yaml` says every folder under `apps/` and `packages/` is a workspace. `tsconfig.base.json` holds the strict compiler settings that each workspace extends, and the root `tsconfig.json` is a "solution" file that `tsc -b` follows through project references (it stays empty until step 0.3 adds the first workspace, so `pnpm typecheck` only becomes meaningful then). pnpm's `node_modules` is strict: a package can only import what it declares in its own `package.json`, so there are no phantom dependencies that work by accident on your machine and break in CI. The `workspace:*` protocol makes one workspace depend on another by linking the local folder instead of fetching from the registry.

### 0.3 — packages/shared skeleton
`@store/shared` holds what the API and web must agree on: money helpers, the API error-code enum with its HTTP statuses, and an empty `schemas/` folder for Zod. It ships TypeScript sources through `exports` (no build step), so the consumers' own tooling compiles it. The first test file pins down rounding, the negative/float guards and currency formatting. Integer cents because floats cannot represent 0.1 exactly, so sums drift and no longer match Stripe to the cent; `Intl.NumberFormat` over hand-formatting because it knows each currency's decimals, symbol position and locale grouping, which string concatenation gets wrong.
