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

### G0.3: package name, README stub, green checks
The root workspace is now `grocery` (the `@store/*` package names are generic and stay), and the
README is a short stub with the new local setup; the case study comes in G11. Every gate ran from a
clean slate: `*.tsbuildinfo` deleted first, because `tsc -b` skips projects whose build info says
nothing changed, so a stale file can make broken code look fine. Results: typecheck, lint, format
clean; shared 338, web 969, API 1,461 + 2 skipped (live Stripe), e2e 79 + 1 skipped (real card).

### Quiz: Phase G0
1. Two folders hold almost the same `docker-compose.yml`. Without `name:`, what would they share, and
   why is that dangerous here?
2. The test setup truncates every table before each test. Why was that slow, and why is turning
   `fsync` off acceptable locally but never in production?
3. Why can `tsc -b` report success on code that doesn't compile, and what do you do about it?

## Phase G1: Strip the pet features

### G1.1: gift finder
Removed the quiz pages, the shared `gift-quiz` rules, the footer link, the route, the i18n keys in
three languages, one e2e test and the tests. No database change. "Gift" also means the free-gift-with-
purchase promotion, which is a different feature and stays. Learn: delete first, then let `tsc -b` list
every caller that broke. The compiler is the safety net, so no hunting by hand. The one thing it cannot
see is text: a test id or a translation key typed as a plain string, so a final `grep` is still worth it.

### G1.2: feeding calculator
Removed the calculator, the feeding table on the product page, its admin editor, the shared `feeding`
maths, the seed tables and the API fields. Surprise: the plan said "no database change", but the table
behind it (`feeding_rows`, plus the `life_stage` type) would have been left with no code and no seed, so
migration 0038 drops both. The "Feeding guide" tab is gone, so a product page now has Description,
Specs (when it has any) and Delivery. Learn: a table nothing reads is a liability (it still has to be
migrated, backed up and explained), so it goes in the same commit as the last code that used it.

### G1.3: pet photo gallery
Removed the "#RealPawsomePets" gallery on the home page and product pages, its admin screen, API module,
upload code, seed photos and the two tables (migration 0039). The orphan-file sweeper now only looks at
review photos. Learn: `DROP TABLE` cannot be undone by `migrate`; the only way back is restoring a
backup or re-creating the table. That is why the seed and the migration must change in the same commit:
a seed that still inserts into a dropped table fails the next `db:seed`, and a migration that runs while
code still reads the table breaks the running site.

### G1.4: vet details
Removed the vet-details form at checkout, the product-page banner, the admin "Vet approvals" queue, the
API module, the three vet emails and the table. Surprise: the vet feature was a whole gate, not one
table. A flagged product held the paid order in its own status, `awaiting_vet_approval`. With nothing
able to set it, the status and the `requires_vet_approval` product flag were dead, so they went too.
Postgres cannot drop one value from an enum, so migration 0040 recreates the `order_status` type
without it. Before that it moves any order held in that status on to `processing`, and rewrites the
history rows to `paid`, so the type change cannot fail on old data. Learn: removing an enum value means
swapping the whole type, so check the data first.

### G1.5: pet profiles and pet messages
Removed "My pets", the header "Shopping for ..." switcher, the guest pet store and its merge on login,
the category-page filter note that followed the chosen pet, the birthday and "time to switch food"
emails with their daily job, the shared `pet-profiles` and `pet-messages` files and both tables
(migration 0041). Kept on purpose: the species value list, the `pet_species` type (menu promos use it,
so it moved to its own schema file instead of being dropped), newsletter pet interests, the mega-menu per
pet, and the pet details a reviewer can add. `NET_UNITS` (g/ml) moved to `unit-price.ts`, next to the
price-per-kg maths that uses it. Learn: when two things share one file, split them before deleting; the
enum a surviving table needs must not go down with the table that happened to define it.

### G1.6: size guides
Removed the size-guide button and dialog on product pages, the measuring illustrations, the admin
editor, the API routes, the seed charts, and the table plus the `products.size_guide_id` column
(migration 0042). Surprise: drizzle wrote `DROP TABLE ... CASCADE` first and then "drop the foreign key",
which fails because the cascade already removed it, so the migration was reordered by hand (constraint,
column, then table). Learn: always read a generated migration; the generator is right about what
changes and sometimes wrong about the order.

### G1.7: phase end
All gates green from a clean slate: shared 259, web 896, API 1,378 + 2 skipped (live Stripe), e2e 74 +
1 skipped (real card). The e2e count fell from 79 because five specs only covered removed features (gift
quiz, guest pets, gallery, vet approval, size guide); the feeding one was rewritten as a plain
tabs-by-keyboard test.

### Quiz: Phase G1
1. `tsc -b` finds the callers of a file you deleted. Name one kind of reference it cannot find, and what
   you use for it.
2. Why did removing one status from `order_status` need the whole type to be recreated, and what had to
   be done to existing rows first?
3. Why was the `pet_species` type kept while the `pets` table that created it was dropped?

## Phase G2: Brand and theme

### G2.1: two store views
The shop now has two store views, `de-en` (English, `en-DE`) and `de-de` (German), both in euros and
shipping to Germany only. Gone: the French dictionaries (web and email), `en-GB`, every GBP price, rate
card and promotion amount in the seed, the admin "Prices" dialog (it only existed to type GBP prices) and
the currency buttons on the analytics page when there is one currency. The old `/eu-en`, `/uk-en` and
`/fr-fr` prefixes redirect to the same path under `/de-en`. Migration 0043 changes the `store_view`
defaults and moves old rows. The currency type narrowed to `'EUR'` on the store view; the engine (per
currency maps, `variant_prices`) stays generic, with EUR data only. Side effect: English numbers now use
German separators (`4,6`), because `en-DE` says so. Surprise: a fresh `db:reset` failed on migration 0040
(G1), because Postgres refuses to use an enum value added in the same transaction; fixed with `::text`.
Learn: removing a language early saves work in every later phase, because each new feature would
otherwise need its copy, its tests and its seed data four times.

### G2.2: palette and type
New tokens: green primary, citrus accent, off-white background; Plus Jakarta Sans for headings (the
Fredoka package is removed). Contrast, computed with the WCAG formula and pinned in `tokens.test.ts`:
ink on background 15.7, ink on surface 16.5, muted on background 6.4, muted on surface 6.8, primary on
background 5.1, primary on surface 5.4, white on primary 5.4 (hover 7.4), strong on background 7.9, ink
on citrus 10.8. All pass AA (4.5). Learn: a colour is only "accessible" in a pair; test the pairs the UI
really uses, not the colours alone.

### G2.3: mark, wordmark and brand name
A `Logo` component draws the bag-and-leaf mark as inline SVG (themed by the tokens, a brighter bag on the
dark footer) next to the word in the display font. `favicon.svg`, PNG icons made with `sharp`, a web
manifest, the theme colour, SEO titles, the email header and sender, and every user-visible "Pawsome" now
say Grocery; demo accounts are `@grocery.test`, the demo password `Grocery-demo-1!`; cookie and storage
keys use `grocery`. Left for G3: the house brand "Pawsome" in the seed (brands, translations, "Made in"
spec) and the pet-themed home content. Learn: SVG stays sharp at 16 px and takes its colours from CSS
variables; a bitmap logo would not.

### G2.4: tone of voice and shell copy
`docs/plan/03-conventions.md` now has a "Tone of voice" section. Shell copy (tagline, cookie notice,
server-down notice, footer, trust bar, 404 and error text, newsletter, email footer and sign-off) is
rewritten to it in English and German ("du"). German outside the shell still says "Sie" until those
features are reworked. Learn: tone is a list of rules you can check a sentence against, not a mood.

### G2.5: phase end
Gates green: shared 260, web 900, API 1,361 + 2 skipped, e2e 75 + 1 skipped. Header checked by eye at
1280 and 375 px: mark crisp, no overflow.

### Quiz: Phase G2
1. Why does the English store view use the locale `en-DE` and not `en-GB`, and what visible effect does
   that have on a number such as 4.6?
2. A colour pair passes AA when the contrast ratio is at least what, and which two pairs matter most
   for the primary green?
3. Why is the logo an inline SVG using CSS variables instead of a PNG, and what must you remember to
   change together when the mark changes?
