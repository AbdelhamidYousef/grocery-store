# Phase G3: Catalogue

Goal: a believable grocery catalogue replaces the pet one: ten departments, about 120 made-up products
from made-up brands, food information (nutrition, ingredients, the 14 EU allergens, dietary tags as
filters), generated product photos, and a quick-commerce home page built from the departments.

Departments (top-level categories, each with 2–4 subcategories): Fruit & veg, Bakery, Dairy & eggs,
Meat & fish, Pantry, Frozen, Drinks, Snacks & sweets, Household, Personal care & baby.

## Step G3.1: departments replace the pet axis
- Remove the pet axis: `attributes.pet`, `PET_VALUES`, `PET_CATEGORY_SLUGS`, the species enum (and
  `menu_promos.pet` → `menu_promos.category_id`, null = any department), newsletter pet preferences
  (→ department interests), per-pet accents (→ one accent colour per department in `tokens.css`),
  `PetTiles` (→ `DepartmentTiles`), mega-menu per department. Migration included.
- Learn / explain: replacing a column that data depends on in one migration (add, backfill, drop).
- Commit: `refactor(catalog): departments replace the pet axis`

## Step G3.2: food information
- Product fields: `nutrition` (per 100 g/ml: energy kJ/kcal, fat, saturates, carbs, sugars, fibre,
  protein, salt; integers in tenths of a gram), `ingredients` (text, allergens marked), `allergens`
  (subset of the 14 EU allergens, shared const), `dietary` tags (`vegan`, `vegetarian`, `gluten-free`,
  `lactose-free`, `organic`). Shared Zod schemas, API output, PDP "Nutrition & ingredients" tab with an
  EU-style table, allergens in bold, dietary tags as PLP facets (`?diet=vegan`). Non-food products have
  none of it. Migration included.
- Learn / explain: why nutrition is stored as integers (tenths of a gram), the same reason as cents.
- Commit: `feat(catalog): nutrition, ingredients, allergens and dietary filters`

## Step G3.3: brands, categories and ~120 products (seed)
- Source of truth: `docs/plan/data/catalogue.json` (8 brands, 10 departments, 120 products with
  German text, nutrition, allergens, dietary tags, and the fields later phases use: `soldByWeight`,
  `shelfLifeDays`, `deposit`). The seed reads it or is generated from it; keep the later-phase fields
  in the JSON even if no column uses them yet.
- 8 made-up brands, the departments and subcategories, one seed file per department
  (`products-<department>.ts`), each product with net contents (g/ml, unit price works), a `look` for
  the image brief, nutrition/allergens/dietary where it is food. Variants only where real (pack
  sizes). Prices in EUR. German names and descriptions in the translations seed. Old pet seed files,
  pet guides, pet reviews and testimonials replaced with grocery ones; charity → two Berlin food banks;
  trials → free samples; safety notices → one example product recall.
- Commit: `feat(seed): grocery catalogue with ten departments`

## Step G3.4: product photos
- Prompts: `docs/plan/data/image-grids.json` (30 grids of four products, by department). Generated in
  Gemini as 2×2 grids, split by `tools/crop-grids.mjs` into `<slug>-1.png`, then `pnpm images:process
  <dir>`. Prompts and the tool go in `CREDITS.md`. Products without a photo keep the placeholder and
  are listed in the handover.
- Commit: `feat(images): generated product photos`

## Step G3.5: quick-commerce home
- Home: hero with a postcode box (wired in G4) and the tagline, department tiles, "Deals this week",
  bestsellers, "Your usuals" slot placeholder (G9), food-bank teaser. Guides become recipes/tips
  (a handful).
- Commit: `feat(home): quick-commerce home built from the departments`

## Step G3.6: phase end
- Gates + e2e (specs updated to grocery products); journal, quiz, handover. Commit:
  `docs(plan): phase G3 done`
