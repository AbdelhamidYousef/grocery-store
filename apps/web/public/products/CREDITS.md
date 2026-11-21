# Product image credits

All product images in this folder are **AI-generated, original artwork** made for this portfolio
project. They are not photographs, they depict made-up products from a fictional shop, and they use
no real brands, logos or people.

## How they are made

1. **Prompts.** `docs/plan/data/image-grids.json` holds 30 prompts, one per grid of four
   products, in department order. Each prompt asks for a square 2x2 grid: four separate studio
   shots on a white background, one product per quadrant, no text and no logos.
2. **Generation.** Each prompt is pasted into Gemini (image generation). The result is saved as
   `grid-NN.png` (NN is the grid number).
3. **Cropping.** `tools/crop-grids.mjs` cuts each grid into four squares, one per product, and
   writes `<product-slug>-1.png`:
   `node tools/crop-grids.mjs docs/plan/data/image-grids.json <dir of grids> <out dir>`.
4. **Processing.** `pnpm images:process <out dir>` turns each file into the two WebP sizes the shop
   serves: `<subcategory-slug>/<product-slug>-1.webp` (1200 x 1200) and a `-600.webp` twin
   (600 x 600).
5. **Seed.** `pnpm db:seed` uses a processed file when it exists and otherwise the department
   placeholder below, so a product without a photo never shows a broken image.

## Placeholders

`placeholders/<department-slug>.svg` are drawn by `tools/make-placeholders.ts`: a soft tile in the
department's colours with its line icon and no text. They are original, not generated.

## Photos

All 120 products have a photo, generated in Gemini: grid 01 on 2026-11-15, grids 02 to 30 on
2026-11-21. Grid 21 came back with small corner letters (A to D) in each quadrant; they were
painted over with the background colour before cropping. The full prompt of every grid is in
`image-grids.json`; the file name, the grid and the quadrant link each photo to its prompt.

| File | Tool | Date | Prompt |
| --- | --- | --- | --- |
| fruit/bananas-1.webp | Gemini | 2026-11-15 | grid-01, top-left |
| fruit/apples-1.webp | Gemini | 2026-11-15 | grid-01, top-right |
| fruit/lemons-1.webp | Gemini | 2026-11-15 | grid-01, bottom-left |
| fruit/strawberries-1.webp | Gemini | 2026-11-15 | grid-01, bottom-right |
| vegetables/tomatoes-1.webp | Gemini | 2026-11-21 | grid-02, top-left |
| vegetables/cucumber-1.webp | Gemini | 2026-11-21 | grid-02, top-right |
| vegetables/organic-carrots-1.webp | Gemini | 2026-11-21 | grid-02, bottom-left |
| vegetables/potatoes-1.webp | Gemini | 2026-11-21 | grid-02, bottom-right |
| vegetables/mushrooms-1.webp | Gemini | 2026-11-21 | grid-03, top-left |
| herbs-salad/organic-baby-spinach-1.webp | Gemini | 2026-11-21 | grid-03, top-right |
| herbs-salad/butterhead-lettuce-1.webp | Gemini | 2026-11-21 | grid-03, bottom-left |
| herbs-salad/fresh-basil-1.webp | Gemini | 2026-11-21 | grid-03, bottom-right |
| bread/rye-sourdough-loaf-1.webp | Gemini | 2026-11-21 | grid-04, top-left |
| bread/wholemeal-toast-1.webp | Gemini | 2026-11-21 | grid-04, top-right |
| bread/seeded-loaf-1.webp | Gemini | 2026-11-21 | grid-04, bottom-left |
| bread/baguette-1.webp | Gemini | 2026-11-21 | grid-04, bottom-right |
| rolls-pretzels/broetchen-6-1.webp | Gemini | 2026-11-21 | grid-05, top-left |
| rolls-pretzels/laugenbrezel-4-1.webp | Gemini | 2026-11-21 | grid-05, top-right |
| rolls-pretzels/seeded-rolls-4-1.webp | Gemini | 2026-11-21 | grid-05, bottom-left |
| rolls-pretzels/spelt-rolls-4-1.webp | Gemini | 2026-11-21 | grid-05, bottom-right |
| cakes-pastries/butter-croissants-4-1.webp | Gemini | 2026-11-21 | grid-06, top-left |
| cakes-pastries/berliner-4-1.webp | Gemini | 2026-11-21 | grid-06, top-right |
| cakes-pastries/marble-cake-1.webp | Gemini | 2026-11-21 | grid-06, bottom-left |
| cakes-pastries/apple-strudel-1.webp | Gemini | 2026-11-21 | grid-06, bottom-right |
| milk-cream/whole-milk-1l-1.webp | Gemini | 2026-11-21 | grid-07, top-left |
| milk-cream/lactose-free-milk-1l-1.webp | Gemini | 2026-11-21 | grid-07, top-right |
| milk-cream/whipping-cream-1.webp | Gemini | 2026-11-21 | grid-07, bottom-left |
| yoghurt-quark/natural-yoghurt-500g-1.webp | Gemini | 2026-11-21 | grid-07, bottom-right |
| yoghurt-quark/quark-40-1.webp | Gemini | 2026-11-21 | grid-08, top-left |
| yoghurt-quark/strawberry-yoghurt-1.webp | Gemini | 2026-11-21 | grid-08, top-right |
| yoghurt-quark/high-protein-skyr-1.webp | Gemini | 2026-11-21 | grid-08, bottom-left |
| cheese/gouda-counter-1.webp | Gemini | 2026-11-21 | grid-08, bottom-right |
| cheese/mozzarella-1.webp | Gemini | 2026-11-21 | grid-09, top-left |
| cheese/cream-cheese-1.webp | Gemini | 2026-11-21 | grid-09, top-right |
| eggs-butter/free-range-eggs-10-1.webp | Gemini | 2026-11-21 | grid-09, bottom-left |
| eggs-butter/butter-250g-1.webp | Gemini | 2026-11-21 | grid-09, bottom-right |
| meat/minced-beef-1.webp | Gemini | 2026-11-21 | grid-10, top-left |
| meat/chicken-breast-1.webp | Gemini | 2026-11-21 | grid-10, top-right |
| meat/pork-schnitzel-1.webp | Gemini | 2026-11-21 | grid-10, bottom-left |
| meat/chicken-drumsticks-1.webp | Gemini | 2026-11-21 | grid-10, bottom-right |
| sausage-ham/black-forest-ham-1.webp | Gemini | 2026-11-21 | grid-11, top-left |
| sausage-ham/salami-100g-1.webp | Gemini | 2026-11-21 | grid-11, top-right |
| sausage-ham/bratwurst-6-1.webp | Gemini | 2026-11-21 | grid-11, bottom-left |
| sausage-ham/turkey-slices-1.webp | Gemini | 2026-11-21 | grid-11, bottom-right |
| fish/salmon-fillet-1.webp | Gemini | 2026-11-21 | grid-12, top-left |
| fish/cod-fillets-1.webp | Gemini | 2026-11-21 | grid-12, top-right |
| fish/smoked-trout-1.webp | Gemini | 2026-11-21 | grid-12, bottom-left |
| fish/matjes-herring-1.webp | Gemini | 2026-11-21 | grid-12, bottom-right |
| pasta-rice/spaghetti-500g-1.webp | Gemini | 2026-11-21 | grid-13, top-left |
| pasta-rice/spaetzle-500g-1.webp | Gemini | 2026-11-21 | grid-13, top-right |
| pasta-rice/basmati-rice-1kg-1.webp | Gemini | 2026-11-21 | grid-13, bottom-left |
| tins/chopped-tomatoes-1.webp | Gemini | 2026-11-21 | grid-13, bottom-right |
| tins/chickpeas-tin-1.webp | Gemini | 2026-11-21 | grid-14, top-left |
| tins/tuna-in-oil-1.webp | Gemini | 2026-11-21 | grid-14, top-right |
| baking-oils/wheat-flour-1kg-1.webp | Gemini | 2026-11-21 | grid-14, bottom-left |
| baking-oils/sugar-1kg-1.webp | Gemini | 2026-11-21 | grid-14, bottom-right |
| baking-oils/olive-oil-500ml-1.webp | Gemini | 2026-11-21 | grid-15, top-left |
| breakfast/rolled-oats-500g-1.webp | Gemini | 2026-11-21 | grid-15, top-right |
| breakfast/strawberry-jam-1.webp | Gemini | 2026-11-21 | grid-15, bottom-left |
| breakfast/peanut-butter-1.webp | Gemini | 2026-11-21 | grid-15, bottom-right |
| frozen-veg/frozen-peas-1.webp | Gemini | 2026-11-21 | grid-16, top-left |
| frozen-veg/frozen-leaf-spinach-1.webp | Gemini | 2026-11-21 | grid-16, top-right |
| frozen-veg/frozen-mixed-berries-1.webp | Gemini | 2026-11-21 | grid-16, bottom-left |
| frozen-veg/frozen-stir-fry-veg-1.webp | Gemini | 2026-11-21 | grid-16, bottom-right |
| frozen-meals/frozen-pizza-margherita-1.webp | Gemini | 2026-11-21 | grid-17, top-left |
| frozen-meals/frozen-fish-fingers-1.webp | Gemini | 2026-11-21 | grid-17, top-right |
| frozen-meals/frozen-fries-1.webp | Gemini | 2026-11-21 | grid-17, bottom-left |
| frozen-meals/frozen-prawns-1.webp | Gemini | 2026-11-21 | grid-17, bottom-right |
| ice-cream/vanilla-ice-cream-1.webp | Gemini | 2026-11-21 | grid-18, top-left |
| ice-cream/chocolate-ice-cream-1.webp | Gemini | 2026-11-21 | grid-18, top-right |
| ice-cream/strawberry-sorbet-1.webp | Gemini | 2026-11-21 | grid-18, bottom-left |
| ice-cream/ice-lollies-8-1.webp | Gemini | 2026-11-21 | grid-18, bottom-right |
| water/still-water-1-5l-1.webp | Gemini | 2026-11-21 | grid-19, top-left |
| water/sparkling-water-1-5l-1.webp | Gemini | 2026-11-21 | grid-19, top-right |
| water/medium-water-1-5l-1.webp | Gemini | 2026-11-21 | grid-19, bottom-left |
| juice-soft/apple-juice-1l-1.webp | Gemini | 2026-11-21 | grid-19, bottom-right |
| juice-soft/apfelschorle-1l-1.webp | Gemini | 2026-11-21 | grid-20, top-left |
| juice-soft/orange-juice-1l-1.webp | Gemini | 2026-11-21 | grid-20, top-right |
| juice-soft/cola-1-5l-1.webp | Gemini | 2026-11-21 | grid-20, bottom-left |
| juice-soft/lemonade-1l-1.webp | Gemini | 2026-11-21 | grid-20, bottom-right |
| coffee-tea/coffee-beans-500g-1.webp | Gemini | 2026-11-21 | grid-21, top-left |
| coffee-tea/ground-coffee-500g-1.webp | Gemini | 2026-11-21 | grid-21, top-right |
| coffee-tea/black-tea-20-1.webp | Gemini | 2026-11-21 | grid-21, bottom-left |
| coffee-tea/peppermint-tea-20-1.webp | Gemini | 2026-11-21 | grid-21, bottom-right |
| crisps-nuts/paprika-crisps-1.webp | Gemini | 2026-11-21 | grid-22, top-left |
| crisps-nuts/salted-peanuts-1.webp | Gemini | 2026-11-21 | grid-22, top-right |
| crisps-nuts/mixed-nuts-1.webp | Gemini | 2026-11-21 | grid-22, bottom-left |
| crisps-nuts/pretzel-sticks-1.webp | Gemini | 2026-11-21 | grid-22, bottom-right |
| chocolate-sweets/milk-chocolate-1.webp | Gemini | 2026-11-21 | grid-23, top-left |
| chocolate-sweets/dark-chocolate-70-1.webp | Gemini | 2026-11-21 | grid-23, top-right |
| chocolate-sweets/hazelnut-chocolate-1.webp | Gemini | 2026-11-21 | grid-23, bottom-left |
| chocolate-sweets/fruit-gummies-1.webp | Gemini | 2026-11-21 | grid-23, bottom-right |
| biscuits/butter-biscuits-1.webp | Gemini | 2026-11-21 | grid-24, top-left |
| biscuits/oat-cookies-1.webp | Gemini | 2026-11-21 | grid-24, top-right |
| biscuits/lebkuchen-1.webp | Gemini | 2026-11-21 | grid-24, bottom-left |
| biscuits/chocolate-wafers-1.webp | Gemini | 2026-11-21 | grid-24, bottom-right |
| cleaning/all-purpose-cleaner-1.webp | Gemini | 2026-11-21 | grid-25, top-left |
| cleaning/glass-cleaner-1.webp | Gemini | 2026-11-21 | grid-25, top-right |
| cleaning/bathroom-cleaner-1.webp | Gemini | 2026-11-21 | grid-25, bottom-left |
| cleaning/kitchen-sponges-6-1.webp | Gemini | 2026-11-21 | grid-25, bottom-right |
| paper-bags/toilet-paper-8-1.webp | Gemini | 2026-11-21 | grid-26, top-left |
| paper-bags/kitchen-roll-4-1.webp | Gemini | 2026-11-21 | grid-26, top-right |
| paper-bags/tissues-box-1.webp | Gemini | 2026-11-21 | grid-26, bottom-left |
| paper-bags/bin-bags-20-1.webp | Gemini | 2026-11-21 | grid-26, bottom-right |
| laundry-dishes/laundry-liquid-1-5l-1.webp | Gemini | 2026-11-21 | grid-27, top-left |
| laundry-dishes/fabric-softener-1l-1.webp | Gemini | 2026-11-21 | grid-27, top-right |
| laundry-dishes/dish-soap-500ml-1.webp | Gemini | 2026-11-21 | grid-27, bottom-left |
| laundry-dishes/dishwasher-tabs-30-1.webp | Gemini | 2026-11-21 | grid-27, bottom-right |
| personal-care/shampoo-250ml-1.webp | Gemini | 2026-11-21 | grid-28, top-left |
| personal-care/shower-gel-250ml-1.webp | Gemini | 2026-11-21 | grid-28, top-right |
| personal-care/toothpaste-75ml-1.webp | Gemini | 2026-11-21 | grid-28, bottom-left |
| personal-care/toothbrushes-2-1.webp | Gemini | 2026-11-21 | grid-28, bottom-right |
| personal-care/roll-on-deodorant-1.webp | Gemini | 2026-11-21 | grid-29, top-left |
| personal-care/hand-soap-300ml-1.webp | Gemini | 2026-11-21 | grid-29, top-right |
| baby/nappies-size-4-1.webp | Gemini | 2026-11-21 | grid-29, bottom-left |
| baby/baby-wipes-64-1.webp | Gemini | 2026-11-21 | grid-29, bottom-right |
| baby/baby-shampoo-200ml-1.webp | Gemini | 2026-11-21 | grid-30, top-left |
| baby/nappy-cream-100ml-1.webp | Gemini | 2026-11-21 | grid-30, top-right |
| baby/baby-oat-porridge-1.webp | Gemini | 2026-11-21 | grid-30, bottom-left |
| baby/baby-fruit-pouches-4-1.webp | Gemini | 2026-11-21 | grid-30, bottom-right |
