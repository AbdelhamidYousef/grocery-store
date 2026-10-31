# Pawsome (working title)

A full-stack e-commerce store for a fictional pet supplies shop: React, Express, Postgres and Stripe in test mode, in a pnpm monorepo.

**Work in progress.** This README is a stub; it becomes a case study when the build is done.

## Local setup

Needs Node 22 (`nvm use`), pnpm (`corepack enable`) and Docker.

```sh
pnpm install
cp .env.example .env
docker compose up -d       # postgres (5432) + mailpit (8025)
pnpm dev                   # web http://localhost:5173, api http://localhost:3000
```

Database migrations and seed data (`pnpm db:migrate && pnpm db:seed`) arrive in phase 1.

## Checks

```sh
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```
