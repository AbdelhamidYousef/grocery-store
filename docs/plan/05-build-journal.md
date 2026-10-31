# Build journal

What was built per step and why, for the owner to read; quiz questions per phase at the end of each phase section.

## Phase 0 — Bootstrap

### 0.1 — git init, ignore, node version
The repository was initialised on `main` with a pinned Node major (`.nvmrc` = 22) and an `.editorconfig` so every editor produces the same whitespace. The existing `.gitignore`, `CLAUDE.md` and `docs/plan/` were picked up as they were. Why `.env.*` is ignored but `.env.example` is force-included: real env files hold secrets and must never be committed, so a wildcard blocks every variant; the `!.env.example` exception lets the one file that documents variable names (without values) stay tracked so a fresh clone knows what to set.
