# Phase G1: Strip the pet features

Goal: remove every pet-only feature Pawsome had, with a migration for each dropped table, so the
engine that remains is the one Grocery builds on. Every check stays green after each step.

Out of scope here, on purpose:
- The pet **axis** of the catalogue (`attributes.pet`, `PET_VALUES`, `PET_CATEGORY_SLUGS`, the
  species enum used by menu promos, newsletter pet preferences, the mega-menu per pet). It is the
  backbone of navigation and is replaced by grocery departments in G3, together with the seed.
- **Charity**: kept. It is wired into loyalty (customers donate points), and "donate points to a
  local food bank" fits a grocery. Its content is rethemed in G3.
- `safety` (becomes product recalls) and `trials` (becomes free samples) are kept and rethemed later.
- Seed data, images, copy and brand: G2/G3.

## Step G1.1: gift finder
- Delete `features/gift-finder`, `GiftFinderPage`, `GiftResultPage`, shared `gift-quiz`, their routes,
  links, i18n keys and tests. No database change.
- Learn / explain: how to find every caller before deleting (the type checker is the safety net:
  delete, then let `tsc -b` list what broke).
- Commit: `refactor(web): remove the gift finder`

## Step G1.2: feeding calculator
- Delete shared `feeding` and its PDP/UI usages, i18n keys and tests. No database change.
- Commit: `refactor(web): remove the feeding calculator`

## Step G1.3: pet gallery
- Delete `modules/gallery`, `features/gallery`, schema `gallery`, its upload references, admin
  moderation, routes, i18n, tests, seed. Migration drops the tables.
- Learn / explain: a destructive migration (DROP TABLE) can't be undone by `migrate`; why the seed
  and migrations must change in the same commit.
- Commit: `refactor(gallery): remove the pet photo gallery`

## Step G1.4: vet details
- Delete `modules/vet`, schema `order-vet-details`, admin vet views, checkout hooks that write vet
  details. Migration drops the table.
- Commit: `refactor(checkout): remove vet details from orders`

## Step G1.5: pet profiles and pet messages
- Delete `modules/pets`, `features/pets`, `PetsPage`, the `pets` and `pet_messages` tables (keep the
  species enum while menu promos use it), shared `pet-profiles`, `pet-messages` and their schemas, the
  guest pet store and its merge on login, account links. Move `NET_UNITS` out of `pets.ts` if it stays
  shared. Migration drops the tables.
- Commit: `refactor(pets): remove pet profiles and pet messages`

## Step G1.6: size guides
- Delete schema `size-guides`, the PDP size-guide tab, the admin editor, seed, i18n, tests. Migration
  drops the table.
- Commit: `refactor(catalog): remove size guides`

## Step G1.7: phase end
- All gates plus `pnpm e2e`; e2e specs that only covered removed features are deleted, mixed ones are
  trimmed. Journal entries, 3 quiz questions, handover.
- Commit: `docs(plan): phase G1 done`
