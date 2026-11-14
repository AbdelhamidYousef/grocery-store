# Plan 06: Handover

Written by the build sessions for the owner and the next session. Newest state first.

## Current state

- **G0 done** (2026-11-14): own ports (Pawsome's + 1), compose project and databases `grocery`;
  all gates green: shared 338, web 969, API 1,461 + 2 skipped, e2e 79 + 1 skipped.
- The API suite went from ~45 to ~8 minutes: local Postgres runs without fsync (see the G0 journal).
  The same fix likely cures Pawsome's "full API suite hangs" issue (its compose file needs the same
  `command:` line); not applied there, since Pawsome's plan is read-only from here.
- **G1 done** (2026-11-14): gift finder, feeding calculator, pet gallery, vet gate, pet profiles and
  messages, and size guides are gone (migrations 0038 to 0042, six local commits, not pushed). Gates
  green: shared 259, web 896, API 1,378 + 2 skipped, e2e 74 + 1 skipped. Next: G2, then push at the
  phase end as approved. The pet axis (species, mega-menu, newsletter pet interests) stays until G3.
- **G2 done** (2026-11-14): two store views (`de-en`, `de-de`, EUR, Germany only; migration 0043),
  green palette and Plus Jakarta Sans, bag-and-leaf `Logo`, favicon and manifest, Pawsome renamed in the
  shell and emails, tone of voice in `docs/plan/03-conventions.md`. Gates green: shared 260, web 900,
  API 1,361 + 2 skipped, e2e 75 + 1 skipped. Still Pawsome: the house brand in the seed (brands, German
  translation, "Made in" spec), and pet-themed home content: all G3. German outside the shell is still
  "Sie". Local DB was reset (`pnpm db:reset`) to pick up `@grocery.test` accounts. Not pushed.

## Waiting on you

- Nothing yet.
