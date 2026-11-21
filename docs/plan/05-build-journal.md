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
The shop now has two store views, `de-en` (English, `en-IE`) and `de-de` (German), both in euros and
shipping to Germany only. Gone: the French dictionaries (web and email), `en-GB`, every GBP price, rate
card and promotion amount in the seed, the admin "Prices" dialog (it only existed to type GBP prices) and
the currency buttons on the analytics page when there is one currency. The old `/eu-en`, `/uk-en` and
`/fr-fr` prefixes redirect to the same path under `/de-en`. Migration 0043 changes the `store_view`
defaults and moves old rows. The currency type narrowed to `'EUR'` on the store view; the engine (per
currency maps, `variant_prices`) stays generic, with EUR data only. The English view uses the locale `en-IE` (euro-zone English: dot decimals, € before the number). Surprise: a fresh `db:reset` failed on migration 0040
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
rewritten to it in English and German. A follow-up pass moved all German UI strings and emails to "du"
(rewritten by hand where the verb changes, not word-swapped), except catalogue texts in the seed. Learn: tone is a list of rules you can check a sentence against, not a mood.

### G2.5: phase end
Gates green: shared 260, web 900, API 1,361 + 2 skipped, e2e 75 + 1 skipped. Header checked by eye at
1280 and 375 px: mark crisp, no overflow.

### Quiz: Phase G2
1. Why does the English store view use the locale `en-IE` and not `en-DE`, and what visible effect does
   that have on a number such as 4.6?
2. A colour pair passes AA when the contrast ratio is at least what, and which two pairs matter most
   for the primary green?
3. Why is the logo an inline SVG using CSS variables instead of a PNG, and what must you remember to
   change together when the mark changes?

## Phase G3: Catalogue

### G3.1 to G3.3: departments, food information, catalogue seed (one commit)
Built on 2026-11-15, committed on 2026-11-21 as one commit (decisions log: the steps were done
together and would not pass the gates apart).
- **Departments replace pets.** Migration 0044 adds the new columns, backfills them, then drops the old
  ones: `menu_promos.pet` → `category_id` (null = any department), newsletter `pets` → `interests`
  (empty = everything), testimonial `pet` → `area` (a Berlin district), review pet age/weight gone,
  the `pet_species` enum dropped. `DEPARTMENTS` in `@store/shared`, `DepartmentTiles` (was
  `PetTiles`), one accent colour per department in `tokens.css`, the mega-menu per department.
- **Food information.** Migration 0045: `nutrition` (jsonb, per 100 g/ml, tenths of a gram),
  `ingredients`, `allergens` (the 14 EU allergens) and `dietary` (GIN-indexed). Shared Zod schemas in
  `food.ts`, a PDP "Nutrition & ingredients" tab (`NutritionPanel`, allergens in bold) and `?diet=`
  as a PLP filter.
- **Catalogue seed.** `seed/catalogue.ts` reads `docs/plan/data/catalogue.json` (8 brands, 10
  departments, 120 products, 98 with nutrition) and checks it with Zod, so a typo fails the seed with
  the product named. Pet seed files, guides and photos are gone; five recipe/tip guides, Berlin
  testimonials and food-bank charity replace them. SVG placeholders per department
  (`tools/make-placeholders.ts`), photos for the first four fruit products, and the home hero with
  the postcode box (G3.5) came along.
- **Clean-up before the commit:** lint (import order, two `any` matchers, redundant union types,
  `tools/**` out of ESLint), and three tests half-renamed from Pawsome (`paws10` vs `GROCERY10`, a
  testimonial still sending `pet`). The reward code prefix `PAWS-` became `REWARD-`, next to
  `FRIEND-` and `WELCOME-`.
Gates green: shared 270, web 920, API 1,377 + 2 skipped (e2e at phase end).
Learn: when a column other data depends on changes, do it in one migration in three moves (add,
backfill, drop), so no row is ever left pointing at nothing.

### G3.4: product photos
All 120 products have a photo. 29 more grids (02 to 30) were generated in Gemini on 2026-11-21 by a
Playwright batch script: new chat, paste the prompt, wait for the image, copy it out through a canvas
and post it to a small local receiver that writes `grid-NN.png`. The script stops on the first text
reply, which is how the daily limit showed up at grid 22; grids 22 to 30 ran on a second login.
`tools/crop-grids.mjs` cut them into 116 squares and `pnpm images:process` made the WebP pair (4.8 MB
in total for the catalogue). Two grids needed care: grid 21 came back with A to D letters in the
corners, painted out with the background colour before cropping; every crop was checked on one
contact sheet. `CREDITS.md` lists all 120 files with their grid and quadrant.

QA sweep (all 10 department pages at 1280 and 375 px): no broken image, no placeholder left, no
long-name outlier (longest "Quark, 40 percent fat in dry matter"). It found three things, all fixed:
- every page was 43 px wider than a 1280 px screen (the department bar; see the decisions log);
- the German menu was empty: navigation matched departments by slug, and German slugs are
  translated. A regression test sends `X-Store-View: de-de`;
- Pawsome copy left in the search placeholder ("Search toys, beds, treats"), the developers page and
  the agent tool examples (a "Rope Tug"); now milk, bread and apples.
Learn: a sweep that measures the same thing on every page (width, broken images, longest name) finds
the outliers that a look at one page misses; the German menu bug only shows when the store view
changes.

### G3.5: quick-commerce home
Most of the home was built with G3.1 to G3.3 (hero with the postcode box, department tiles, seasonal
strip, featured offers, deals, bestsellers, recipes, reviews, food-bank teaser, newsletter). Measuring
every section at 1280 and 375 px found the outliers: on a phone the department tiles were 878 px
tall (big cards, 2 by 5), now compact rows at 442 px; the German tiles had no product counts
(looked up by the translated category slug, now by `departmentSlug`, with a test); and the
Christmas strip opened with lemons, because the seed stored a listed collection in catalogue order.
It now keeps the written order, so the strip opens with flour, sugar, butter and cream.

### G3.6: phase end
The e2e specs still used Pawsome's pets (38 of 76 failed). `catalog.spec.ts` was ported by hand
first, which found one more app bug: the free-sample picker showed raw values, "Trial" before
"Full"; it now says "Pack: Full size / Free sample" in both languages. The other 13 specs were
ported by one helper agent (one, because e2e runs share a database and ports), and the result was
reviewed and re-run here. Features that no longer exist were replaced in kind, not dropped: the
carousel test checks the postcode hero, the pet-weight review field became the recommendation.
Gates green: shared 270, web 923, API 1,378 + 2 skipped, e2e 75 + 1 skipped (real Stripe, needs
keys). Known flaky: the back-in-stock mail missed its 60 s window once under full-suite load and
passed alone and in the next full run.
Learn: an end-to-end suite written against one catalogue is a list of everything the shop promises;
porting it is where leftover bugs surface (the picker labels), so read each failure before changing
the test.

### Quiz: Phase G3
1. Migration 0044 replaces `menu_promos.pet` with `category_id`. Why add, backfill and drop in one
   migration instead of dropping the old column first?
2. Nutrition is stored in tenths of a gram as integers. What goes wrong with floats, and which other
   value in the shop follows the same rule?
3. The German menu came back empty. What did the code compare, what should it have compared, and
   why does `/c/fruit-veg` still work in the German store?
4. Why were the product photos generated as 2×2 grids, and what is the cost of that choice?

## Phase G4: areas and dark stores

### G4.1: follow-ups from G3
Order numbers now start with `GR-` (migration 0046 changes the column default; existing orders keep
`PW-`, and the shared order-number check accepts both). The review form's "Size you bought" field is
gone from the shared schema, the API, the form, both languages and the tests, and migration 0046
drops `reviews.size_purchased`. Surprise: the no-hard-literals test whitelists the order-number
placeholder by its prefix, so the placeholder rename failed it until the whitelist followed.
Learn: a default that lives in the database (the order number) is changed with a migration, never in
code alone, and old rows keep the value they were born with.

### G4.2: areas, stores and postcodes (API)
Three tables (`delivery_areas`, `dark_stores`, `postcodes`; migration 0047), four Berlin areas with one
dark store each and 34 real postcodes. `GET /delivery/postcodes/:code` and `GET /delivery/areas` are
public and cached; a new `deliveryContext` middleware (next to the store-view one) reads `X-Postcode`
and puts `{postcode, served, area, storeId}` on the request, falling back to Mitte. The ids of the
areas and stores are fixed, not random: the migration, the seed and the test setup all create the same
four stores, and a fixed id means they agree without a lookup. The migration creates the stores itself
(not only the seed) because G4.3's migration copies stock to them on a database that was never
reseeded. Surprise: the API tests truncate every table before each test, which also empties the
reference data, so the test setup re-inserts it (same function as the seed) and clears the lookup
cache.
Learn: a lookup table beats a rule ("10xxx is Mitte") because real areas are not ranges; Neukölln and
Kreuzberg interleave in the 12xxx and 10xxx blocks.

### G4.3: stock per dark store
`inventory` is now one row per store and variant (primary key `store_id, variant_id`), and so are the
adjustments; orders carry `dark_store_id`, alerts `store_id`. Migration 0048 adds the column, makes
the old row the Mitte row, copies it (same quantity, no reservations) to the other three stores, then
drops the old key and adds the new one, all in one transaction; existing orders and alerts point at
Mitte, so releasing an old reservation still finds its row. Every read of availability now names a
store: `stockQuantity`/`stockReserved` and the new `inventoryAt(variantId)` join default to the
request's store (the `X-Postcode` one), and the admin, the alert job and checkout pass a store
explicitly. Checkout takes the store from the delivery ADDRESS (a served postcode, else
`422 POSTCODE_NOT_SERVED` naming the areas) and runs the whole order transaction as that store, so
even the cart re-pricing inside it reads the shelf that will be reserved; lock, reserve, release,
commit and restock all take the store, and a retried payment whose address moved to another store
gives the old store's reservation back and reserves in the new one. Admin: one stock row per store in
the editor and the API (`stores` on each variant, `storeId` on the count), low-stock stats split by
store, the analytics CSV has a store column. The seed gives each store its own deterministic spread
(the prawns are sold out in Mitte and Prenzlauer Berg, in stock in Neukölln).
Surprises: (1) a module-level `const availableOf = sql...` froze the store at import time (the default
parameter is read once), so three of them became functions; (2) the admin product list counted every
variant four times once `inventory` had four rows per variant (`count(distinct ...)` now); (3) the
back-in-stock trigger had to learn the store, or a restock in Mitte would have woken Neukölln alerts.
Learn: when a table's key gains a dimension, every join on the old key silently multiplies rows; find
them by grepping for the table, not by waiting for a wrong number.

### G4.4: postcode gate in the web
`DeliveryProvider` (inside `AppLayout`, so it sees the router) holds the postcode: `?postcode=` in the
URL wins and is remembered in local storage, the rest of the app reads it with `useDelivery()` (`postcode`,
`served`, `area`, `store`, `status`, `setPostcode`, `clear`), and `apiFetch` sends it as `X-Postcode` on
every call, read from a small module (`lib/postcode.ts`) so a request never waits for React. The lookup
is `GET /delivery/postcodes/:code`, cached five minutes. The home hero and the new header chip share one
`PostcodeForm`; the result line reads "We deliver to 10115 · Mitte", or "We don't deliver to 12345 yet"
with the list of areas. The chip opens a dialog (change or remove the postcode) and on a phone shows just
the number next to the search box, so the 375 px header gained no row. "Sold out" says "Sold out at
Neukölln" once a store is known (card and PDP). Checkout starts the address at the gate postcode, checks
the postcode on the details step (a 400 or "not served" stops there, inline on the field, with the areas
we cover), and a 422 `POSTCODE_NOT_SERVED` from the API sends the shopper back to that step with the same
sentence. `/delivery` lists the areas, their stores and postcodes (linked from the footer). EN and DE
strings in a new `delivery.*` namespace (du in German).
Surprise: the German chip text is longer than English ("Keine Lieferung nach 80331"), so the long form
only shows from `sm` up. Learn: state that must be on every request but changes rarely (store view,
postcode) belongs in a plain module the fetch layer reads, with React only mirroring it; a hook the fetch
layer would have to ask can be a render behind.

### G4.5: phase end (e2e)
The e2e suite had been written for one Pawsome postcode that happens to be a served Mitte one (10115),
so the checkout specs needed no port and the `GR-` matchers were already right. One spec failed, and
it was a spec problem, not an app bug: the admin stock dialog used to say "reserved by unpaid orders 3"
in a hint, and since G4.3 that number sits in the per-store table (one row per store), so the spec now
reads the Mitte row's Reserved cell. New spec `e2e/delivery-areas.spec.ts`: no postcode, the prawns
are sold out (Mitte); enter 12045 in the hero, the hero names Neukölln and the chip says "Deliver to
12045"; the prawns can be added to the cart; checkout to a Neukölln address succeeds and the admin
inventory call shows the reservation on Neukölln and none new on Mitte. The spec raises Neukölln's
shelf first, as the older specs do, so repeated runs never use it up. Surprise: the chip shows the
postcode only (the area name is in the hero result), which is by design for the phone header.
Learn: when a feature moves a number from a sentence into a table, the spec that read the sentence
fails with a puzzling text dump; read the received text before blaming the app.

### Quiz: Phase G4
1. Why does checkout take the store from the delivery address and not from the header?
2. Migration 0048 copies every stock row to all four stores. What would break if it only moved the rows
   to Mitte and left the others empty? And why do old reservations stay on Mitte?
3. `const availableOf = sql...` sat at module level and showed the wrong store. Why, and what fixes it?
4. The admin product list showed 8 variants for a product with 2. Which join caused it?


## Phase G5: delivery slots

### G5.1: slot model and generation
`packages/shared/src/slots.ts` holds the rules (`SHOP_ZONE = 'Europe/Berlin'`, 1-hour slots, bookable until
60 minutes before the start, 7 days, 15-minute hold, 30-minute express) and pure helpers: a day's slot
starts from a store's opening hours, the day keys of the horizon, "is the store open now", and the labels
("Today 14:00–15:00", "Heute", "Morgen" from `Intl.RelativeTimeFormat`, so no dictionary). Migration 0049
adds `delivery_slots` (unique store + start, capacity > 0) and the store columns `opens_at`, `closes_at`,
`slot_capacity`, `express_riders`. The `generate-slots` job (daily, in the job runner, also run by the
seed) inserts the next 7 days per active store with `ON CONFLICT DO NOTHING`. Tests include the two
change days: 2027-03-28 (23 hours, 08:00 is still 08:00) and 2026-10-25 (25 hours), and an overnight
store whose windows add up to 5 and 7 real hours.
Surprise: a wall time that does not exist (02:30 in spring) or exists twice (02:30 in autumn) needs a
rule; ours lands an hour later / on the second occurrence, and a test pins it, although a store never
opens at those hours. The 5-minute job cadence the next step needs is not in the runner yet (hourly and
daily only); it arrives with G5.2.
Learn: build time from wall-clock parts in the zone and convert once at the end; adding 3,600,000 ms to
"08:00" works until the one day a year it does not.

### G5.2: holds, capacity and express (API)
Migration 0050 adds `slot_holds` (one per cart, unique `cart_id`), `carts.express`, the order columns
`delivery_kind`, `slot_id`, `delivery_from`, `delivery_to`, and the shipping methods (`slot` 2.99 € free
over 49 €, `express` 4.99 € never free; `standard` kept but switched off). New code in
`modules/delivery/holds.ts`; its header comment is the design. `GET /delivery/slots` (live, `no-store`,
per `X-Postcode`), `PUT/DELETE /cart/slot`, `PUT /cart/express`; the cart answer carries `delivery` and
the order answer carries the window. Booking locks the slot row `FOR UPDATE`, counts live holds of other
carts plus orders not cancelled or refunded, and upserts the hold; express locks the store row and counts
express orders of the last 30 minutes against `express_riders`. Checkout takes the delivery first
(`takeDelivery`): a live hold on a slot of the ADDRESS's store becomes the order's slot and the hold is
deleted in the same transaction as the stock reservation; no hold is `DELIVERY_REQUIRED`, an expired one
`SLOT_HOLD_EXPIRED`, another area `SLOT_WRONG_AREA`. The job `release-slot-holds` (new `five-minutes`
cadence in the runner) only deletes holds expired over an hour ago. The tests include six carts racing
for one place (exactly one wins), and I checked by hand that they fail when the `FOR UPDATE` is removed.
Existing checkout tests use a test helper: `makeShopper` picks the first open slot through the real
`PUT /cart/slot` before a `POST /checkout`.
Surprises: (1) a retried payment has no hold any more (the first attempt used it), so the pending order
itself carries the slot for the retry; (2) when Stripe fails right after the order was placed, the order is
cancelled and its place is free, so the hold is restored (otherwise "press pay again" would ask for a time
a second time); (3) the helper's cart read repaired carts and hid two tests' warnings, so those tests pick
the slot before changing stock or prices.
Learn: when a count decides who gets the last place, the lock must be on a row both writers share (the
slot), taken before the count; a unique key alone only tells the loser after the fact.

### G5.3: slot picker and delivery times in the web
Checkout step 2 is now "Delivery time" (`DeliveryTimeStep`, replacing the shipping radios): an express card
when the API says a rider is free, otherwise the reason ("Express is only offered while the store is
open"), then day tabs and hour buttons; full and closed slots are disabled and say so. Choosing calls
`PUT /cart/slot` (or `/cart/express`) at once, so what the cart shows is what the server holds; "Held for
14:32" counts down against the server clock (the same offset trick as the sale banner) and, at zero,
refetches the cart. The fee follows the choice (express fee, else the slot fee). A checkout refused for the
delivery time (`SLOT_HOLD_EXPIRED`, `SLOT_FULL`, `SLOT_WRONG_AREA`, ...) goes back to this step with the
reason. The parcel estimate is gone: `NextDelivery` ("Next delivery: today 14:00–15:00" or "Express in 30
minutes") sits on the product page and the cart summary, built from the same slots call. `shared/delivery.ts`
(Amsterdam zone, cutoff, holidays), `GET /delivery-methods` and its schema are deleted. The order
confirmation, the account order page, the tracking page and both order emails show the window ("Arrives Mon
23 Nov 14:00–15:00", "Express, by 14:30"), in Berlin time and the language of the store view. EN and DE
strings in the `delivery.*` namespace (du in German).
Surprises: (1) `react-hooks/purity` forbids `Date.now()` in render, so a small `useServerNow` hook ticks the
clock; (2) a hold that the first checkout attempt used is gone on a retry, so the pending order carries the
slot (already covered in G5.2); (3) the German day labels come from `Intl`, so "Heute/Morgen" needed no keys
for the sentences but the tabs still use dictionary keys, because a tab says only that one word.
Learn: a countdown that decides a rule (a hold) must read the server's clock, not the device's, and the
server must still be the judge when it reaches zero.

### G5.4: phase end (e2e)
Every e2e spec that places an order through the API now holds a slot first with a helper over the real
endpoints (`pickSlot` in `e2e/helpers.ts`) and pays with the `slot` method, because the old `standard`
method is switched off; the UI specs (checkout, keyboard-only purchase) pick a slot in the new step. The
keyboard spec tabs to an open slot button and holds it with Enter. New spec `e2e/delivery-slots.spec.ts`:
eight guest carts hold the places of the last open slot of the week, and the picker then shows that slot
as disabled and "Full"; an open slot can be held and the cart carries it. The paid-order specs now also
check that the confirmation shows "Arrives ... 14:00–15:00". Surprises: (1) parallel specs all took the
first open slot, which holds 8, so the helper starts at a random slot and moves on when one fills up
(the UI specs still take the first); (2) the e2e database needs `pnpm db:migrate && pnpm db:seed` first,
the seed now creates the next 7 days of slots; (3) `getByRole('heading', { name: 'Delivery time' })`
matched the picker's own "Choose a delivery time" too (names match as substrings), so the keyboard spec
uses `exact: true`. The known load flake "back in stock" (it waits for a mail through two `pnpm` spawns)
failed in three of four full runs and passes alone in about 8 seconds.
Learn: a shared fixture with a capacity (8 places) turns parallel tests into competitors; spread them out
or make them tolerate a full slot.

### Quiz: Phase G5
1. Two carts ask for the last place of a slot at the same moment. Why does counting alone not stop both
   from getting it, and what makes the second one wait? What would a unique key have told the loser, and
   when?
2. A hold expires 15 minutes after it was made, yet a job deletes holds. If the job stopped running for a
   week, what would shoppers notice, and why?
3. Why is the hold deleted in the same transaction that reserves the stock and writes the order, and what
   would a shopper see if it were deleted in a separate step that failed?
4. A slot starts at 08:00 on 2027-03-28, the day the clocks go forward. Why does adding 3,600,000 ms per
   hour to midnight give the wrong answer, and what does the shared helper do instead?

## Phase G6: weight and expiry

### G6.1: batches and first-expired-first-out (API)
Migration 0051 adds `stock_batches` (store, variant, `best_before` date or null, quantity, `received_at`;
a composite FK to the `inventory` row), `order_item_batches` (which packs a line took) and
`products.shelf_life_days` (backfilled from the catalogue attributes; null = not food), and backfills one
batch per stock row. `modules/stock/batches.ts` is the only code that writes batches, and every function in
it moves `inventory.quantity` in the same breath, under the lock the caller already holds
(`lockInventory`, (store, variant) order): `commitOrderStock` (payment: the oldest packs go, recorded per
order line), `restoreOrderStock` (cancel or refund of a paid, unshipped order: back into the SAME batches;
a line with no record, from before G6, returns as a new undated batch), `receiveStock` (admin increase,
returned household goods), `removeOldestStock` (admin decrease), `writeOffExpired`. The transition
function calls them instead of the old inventory-only helpers. The new job `write-off-expired` (daily)
zeroes batches past their date, lowers the stock row and writes an `expired` adjustment. A food return is
refunded and written off (an adjustment `written_off_return`, delta 0, because the units had already left
`quantity`); household goods go back as an undated batch. The seed gives every stock row one to three
batches from `shelfLifeDays`, some short-dated (1 to 2 days) and a few expired, insert-only like the stock.
One test helper, `expectBatchInvariant()` (`test/stock.ts`), asserts sum(batches) = `inventory.quantity` for
every row; it runs after every step of the random checkout/payment/cancel property test and as an
`afterEach` in the admin stock, returns, transition and sweeper suites, plus in the batch tests.
Surprise: the existing suite needed almost no changes: only the factories (a shelf is one undated batch;
`stockAt` rewrites it). Tests that poke `inventory.quantity` straight in SQL never reach a commit.
Learn: a number that is "the sum of other rows" is only safe when there is one writer; funnelling every
write through one module, under the lock that already existed, is what made the invariant testable.

### G6.2: best-before dates and short-dated prices
Shared `expiry.ts`: the day classes (`expired` the day after its date, `short` for a date at most two days
away, `regular`), `daysUntil`, `compareBestBefore` and `shortDatedPrice` (30 % off, the reduction rounded
once half up and subtracted, so price + reduction is the normal price; tested for every price up to 50 €).
Migration 0052 adds `cart_items.short_dated` and `order_items.short_dated`. `stock/short-dated.ts` counts the
offer: units in batches dated today..today+2, minus short-dated units of pending orders at that store, capped
by `quantity - reserved`; nothing is stored. The cart reads it inside `loadCart`, checkout inside the same
transaction as the reservation (after `lockInventory`, and again explicitly before `reserveStock`), a retried
payment leaves its own earlier attempt out (`exceptCartId`). A short-dated cart line is priced as a fixed price
(like a trial size or a kit: no sale, member price or code on top), drawn from short-dated batches at payment
(`order_item_batches.short_dated`). The PDP variant carries `bestBefore` ("at least": the oldest regular date,
the oldest short date when every pack is short) and `shortDated: { units, bestBefore, priceCents, percentOff }`;
`GET /products/short-dated` gives the cards of the store's deals. Web: "Best before at least 25 Nov" under the
SKU line, the offer box with its own "Add short-dated" button, the line mark in the cart ("Short date · Best
before 23 Nov, 30 % off"), and a "Short-dated deals" shelf on the home page (a new home slot) and on the plain
first page of a department. Tests: a race for the last short-dated pack (one wins, one gets 409), the count
minus held units, a cancel back into the same short batch.
Surprise: the first idea (two cart lines per variant, one normal and one short) would have put `variantId` +
`shortDated` into every key of the pricing engine and of the order snapshot; one line per variant (choosing the
other offer switches it) needed none of that.
Learn: count what you can derive (units in short batches minus held) instead of storing a second reservation
number; the one lock that already guards the stock row guards the count too.
