# Plan 04: Decisions log (append-only, newest at the bottom)

Format: date · decision · why · alternatives rejected · revisit when. Lines tagged REVIEW were made by
the build sessions on the owner's behalf; change any you disagree with. Pawsome's log is in
`docs/pawsome-plan/04-decisions-log.md` and still explains the engine.

- 2026-11-14 · Copy Pawsome with full history (option B), remove the pet features, add logistics · ~75% of the engine is reusable and the history shows how it was built · a fresh repo (redo the engine), a branch inside Pawsome (mixes two products) · never.
- 2026-11-14 · Public name **Grocery** · owner's call: plain, says what it is · clever brand names · never.
- 2026-11-14 · REVIEW · Ports: Postgres 5433, Mailpit 1026/8026, API 3001, web 5174, e2e 3101/5274 · each Pawsome port + 1, easy to remember, both projects run at once · random ports · never.
- 2026-11-14 · REVIEW · Compose project `grocery`, database and user `grocery` / `grocery_test` · separate containers and volumes from Pawsome, and the names say which project a database belongs to · keeping `ecommerce` (two volumes with the same database name is confusing) · never.
- 2026-11-14 · REVIEW · Local Postgres runs with `fsync=off`, `synchronous_commit=off`, `full_page_writes=off` · each per-test truncate of 78 tables took 1.8 s with fsync (a ~45-minute API suite); 0.17 s without, suite now ~8 minutes · per-table DELETE instead of TRUNCATE (needs foreign-key order, and resets no sequences), a tmpfs volume (data lost on every restart) · revisit if local data ever matters.
