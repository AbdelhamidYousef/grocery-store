# Build journal

What was built per step and why, for the owner to read; three quiz questions at the end of each phase.
Pawsome's journal (`docs/pawsome-plan/05-build-journal.md`) explains the engine this repo starts from.

## Phase G0: Fork setup

### G0.1: fresh plan folder
Pawsome's whole plan moved to `docs/pawsome-plan/` with `git mv`, and `docs/plan/` restarted with the
Grocery overview, this journal, the decisions log and the handover. Why `git mv` keeps history: git
stores snapshots, not renames; when you ask for history (`git log --follow`), it spots that a file
vanished and one with almost the same content appeared, and links the two. So moving is free as long
as the content doesn't change much in the same commit.

### G0.2: own ports, database names and compose project
Every port is Pawsome's plus one (Postgres 5433, Mailpit 1026/8026, API 3001, web 5174, e2e
3101/5274), the database and user are `grocery` / `grocery_test`, and `docker-compose.yml` sets
`name: grocery`. A compose project name prefixes everything compose creates (`grocery-postgres-1`, the
`grocery_pgdata` volume, the network), so two copies of almost the same compose file never share a
container or, worse, a database.

One finding on the way: the API suite was crawling (about 3 s per test, so ~45 minutes in all). The
test setup truncates all 78 tables before every test, and each truncate took 1.8 s, because
TRUNCATE gives every table fresh files on disk and Postgres waits for the disk to confirm each one
(`fsync`). The local Postgres now starts with `fsync=off`, `synchronous_commit=off` and
`full_page_writes=off`: a truncate takes 0.17 s. Those settings trade crash safety for speed, which is
fine for a throwaway local database and never touches production (Neon). This is also the likely cause
of the "full API suite hangs, admin tests time out" issue Pawsome recorded: slow truncates push the
tests past their timeouts.
