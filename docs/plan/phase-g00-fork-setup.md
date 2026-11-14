# Phase G0: Fork setup

Goal: the copied Pawsome repo runs side by side with Pawsome on the same machine, under its own name,
with a fresh plan folder and every check green. No product changes yet.

Ports (Pawsome's in brackets): Postgres 5433 (5432), Mailpit SMTP 1026 (1025), Mailpit UI 8026 (8025),
API 3001 (3000), web 5174 (5173), e2e API 3101 (3100), e2e web 5274 (5273).

## Step G0.1: fresh plan folder
- Move Pawsome's plan to `docs/pawsome-plan/` (read-only reference). New `docs/plan/` with the
  overview, this file, `04-decisions-log.md`, `05-build-journal.md`, `06-handover.md`. CLAUDE.md
  rewritten for Grocery.
- Acceptance: `git status` shows renames, not deletions plus additions.
- Learn / explain: why `git mv` keeps a file's history (git detects renames by content similarity;
  `git log --follow` walks across them).
- Commit: `docs(plan): start the Grocery plan, keep Pawsome's plan as a reference`

## Step G0.2: own ports, database names and compose project
- `docker-compose.yml`: `name: grocery`, Postgres on 5433, Mailpit on 1026/8026, database and user
  `grocery`, test database `grocery_test`. API default port 3001, web 5174, Vite proxy to 3001,
  mailer default SMTP 1026, e2e ports 3101/5274. `.env.example`, CI and tests follow.
- Acceptance: `docker compose up -d` starts next to Pawsome's containers; `pnpm db:migrate && pnpm
  db:seed` works; `curl localhost:3001/api/v1/health` is ok while Pawsome runs on 3000.
- Learn / explain: what a compose project name is (it prefixes containers, networks and volumes, so
  two copies of one compose file don't share a database).
- Commit: `chore(dev): give Grocery its own ports, database and compose project`

## Step G0.3: package name, README stub, green checks
- Root package `grocery`; README replaced by a short stub (the case study comes in G11).
- Run every gate, and the e2e suite once, from a clean `*.tsbuildinfo`.
- Acceptance: typecheck, lint, format, test and e2e all pass.
- Learn / explain: why stale `tsbuildinfo` files can make `tsc -b` pass on broken code.
- Commit: `chore(repo): rename the workspace to grocery and stub the README`
