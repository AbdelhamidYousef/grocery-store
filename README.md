# Grocery

A fictional quick home-delivery shop for groceries and home basics: enter a postcode, pick a delivery
slot (or "within 30 minutes" where the area allows it), say what to do if something is out of stock,
and pay with Stripe in test mode. A portfolio project; the brand, products and shops are made up.

> Work in progress. This repository started as a copy of
> [Pawsome](https://github.com/AbdelhamidYousef/pawsome-store) (a pet-supplies shop), whose engine it
> keeps. The new work is **logistics**: delivery areas and dark stores, slot capacity, food that
> expires, items sold by weight, and substitutions. The case study arrives with the last phase; the
> plan is in [docs/plan](docs/plan/00-overview.md).

## Local setup

Needs Node 22, pnpm and Docker. Run from the repository root. The ports differ from Pawsome's, so
both can run on one machine.

```sh
nvm use                      # Node 22 (.nvmrc); skip if you manage Node otherwise
corepack enable              # gives you the pinned pnpm
pnpm install
cp .env.example .env         # the defaults work as they are; Stripe keys stay empty
docker compose up -d         # Postgres on 5433, Mailpit on 8026
pnpm db:migrate
pnpm db:seed                 # prints the demo logins
pnpm dev                     # web http://localhost:5174, API http://localhost:3001
```

Check it: `curl localhost:3001/api/v1/health` answers `{"status":"ok","db":"ok",...}`. Captured
emails are at http://localhost:8026.

Checks, as CI runs them:

```sh
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm e2e                     # needs the services above and a migrated, seeded database
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the commit style and branch flow.

## Licence

[MIT](LICENSE).
