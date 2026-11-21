# Credits

Grocery is a fictional shop made for a portfolio. Everything below is original, generated or
open source. Nothing is copied from another shop or brand.

## Brand and copy

- The name "Grocery", the bag-and-leaf logo (inline SVG drawn for this project), the departments,
  the products, the four Berlin dark stores (their names and addresses) and the guides are made up.
  The street address in return emails (Lindenstrasse 1, 10115 Berlin) is made up too.
- The English and German texts, the help articles and the legal pages were written for this
  project and are marked as fictional. They are not legal advice.
- Berlin district names and postcodes are real places used as a backdrop; no shop or delivery
  service there is implied.

## Images

- **Product photos (120 products).** Generated with Google Gemini (image generation, the
  consumer web app) between 2026-11-14 and 2026-11-21, from the prompts kept in
  `docs/plan/data/image-grids.json`. Each prompt asks for a 2x2 grid of four studio shots; the
  grids were cut into single photos with `tools/crop-grids.mjs` and turned into WebP with
  `pnpm images:process`. Two grids had stray letters painted out with the background colour.
  The table below lists the grid and the quadrant each photo came from. Generated images have
  no photographer; no real brand, label or person is shown.
- **Department tiles and icons** are drawn for this project as inline SVG.
- **Screenshots** in `docs/screenshots/` were taken from the live demo
  (https://grocery-store-bice-two.vercel.app). They contain no customer data.

## Fonts

- Plus Jakarta Sans and Nunito Sans, through the `@fontsource-variable` packages (SIL Open Font
  Licence 1.1).

## Software

Open source, under their own licences (see each package):
React, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS, Vite, Express, Drizzle
ORM, postgres.js, Pino, Helmet, Nodemailer, Sharp, react-markdown, gray-matter, Vitest, Testing
Library, MSW, Playwright, ESLint, Prettier, TypeScript.

Services used on free tiers: Vercel (hosting), Neon (Postgres), Stripe (test mode only, no real
money), GitHub (code and Actions), Mailpit (local mail capture).

The e-commerce engine (catalogue, cart, checkout, orders, admin, loyalty, returns) comes from the
author's own project Pawsome, https://github.com/AbdelhamidYousef/pawsome-store.

## Photo list

| Product slug | Grid | Quadrant |
| --- | --- | --- |
| bananas | grid-01 | top left |
| apples | grid-01 | top right |
| lemons | grid-01 | bottom left |
| strawberries | grid-01 | bottom right |
| tomatoes | grid-02 | top left |
| cucumber | grid-02 | top right |
| organic-carrots | grid-02 | bottom left |
| potatoes | grid-02 | bottom right |
| mushrooms | grid-03 | top left |
| organic-baby-spinach | grid-03 | top right |
| butterhead-lettuce | grid-03 | bottom left |
| fresh-basil | grid-03 | bottom right |
| rye-sourdough-loaf | grid-04 | top left |
| wholemeal-toast | grid-04 | top right |
| seeded-loaf | grid-04 | bottom left |
| baguette | grid-04 | bottom right |
| broetchen-6 | grid-05 | top left |
| laugenbrezel-4 | grid-05 | top right |
| seeded-rolls-4 | grid-05 | bottom left |
| spelt-rolls-4 | grid-05 | bottom right |
| butter-croissants-4 | grid-06 | top left |
| berliner-4 | grid-06 | top right |
| marble-cake | grid-06 | bottom left |
| apple-strudel | grid-06 | bottom right |
| whole-milk-1l | grid-07 | top left |
| lactose-free-milk-1l | grid-07 | top right |
| whipping-cream | grid-07 | bottom left |
| natural-yoghurt-500g | grid-07 | bottom right |
| quark-40 | grid-08 | top left |
| strawberry-yoghurt | grid-08 | top right |
| high-protein-skyr | grid-08 | bottom left |
| gouda-counter | grid-08 | bottom right |
| mozzarella | grid-09 | top left |
| cream-cheese | grid-09 | top right |
| free-range-eggs-10 | grid-09 | bottom left |
| butter-250g | grid-09 | bottom right |
| minced-beef | grid-10 | top left |
| chicken-breast | grid-10 | top right |
| pork-schnitzel | grid-10 | bottom left |
| chicken-drumsticks | grid-10 | bottom right |
| black-forest-ham | grid-11 | top left |
| salami-100g | grid-11 | top right |
| bratwurst-6 | grid-11 | bottom left |
| turkey-slices | grid-11 | bottom right |
| salmon-fillet | grid-12 | top left |
| cod-fillets | grid-12 | top right |
| smoked-trout | grid-12 | bottom left |
| matjes-herring | grid-12 | bottom right |
| spaghetti-500g | grid-13 | top left |
| spaetzle-500g | grid-13 | top right |
| basmati-rice-1kg | grid-13 | bottom left |
| chopped-tomatoes | grid-13 | bottom right |
| chickpeas-tin | grid-14 | top left |
| tuna-in-oil | grid-14 | top right |
| wheat-flour-1kg | grid-14 | bottom left |
| sugar-1kg | grid-14 | bottom right |
| olive-oil-500ml | grid-15 | top left |
| rolled-oats-500g | grid-15 | top right |
| strawberry-jam | grid-15 | bottom left |
| peanut-butter | grid-15 | bottom right |
| frozen-peas | grid-16 | top left |
| frozen-leaf-spinach | grid-16 | top right |
| frozen-mixed-berries | grid-16 | bottom left |
| frozen-stir-fry-veg | grid-16 | bottom right |
| frozen-pizza-margherita | grid-17 | top left |
| frozen-fish-fingers | grid-17 | top right |
| frozen-fries | grid-17 | bottom left |
| frozen-prawns | grid-17 | bottom right |
| vanilla-ice-cream | grid-18 | top left |
| chocolate-ice-cream | grid-18 | top right |
| strawberry-sorbet | grid-18 | bottom left |
| ice-lollies-8 | grid-18 | bottom right |
| still-water-1-5l | grid-19 | top left |
| sparkling-water-1-5l | grid-19 | top right |
| medium-water-1-5l | grid-19 | bottom left |
| apple-juice-1l | grid-19 | bottom right |
| apfelschorle-1l | grid-20 | top left |
| orange-juice-1l | grid-20 | top right |
| cola-1-5l | grid-20 | bottom left |
| lemonade-1l | grid-20 | bottom right |
| coffee-beans-500g | grid-21 | top left |
| ground-coffee-500g | grid-21 | top right |
| black-tea-20 | grid-21 | bottom left |
| peppermint-tea-20 | grid-21 | bottom right |
| paprika-crisps | grid-22 | top left |
| salted-peanuts | grid-22 | top right |
| mixed-nuts | grid-22 | bottom left |
| pretzel-sticks | grid-22 | bottom right |
| milk-chocolate | grid-23 | top left |
| dark-chocolate-70 | grid-23 | top right |
| hazelnut-chocolate | grid-23 | bottom left |
| fruit-gummies | grid-23 | bottom right |
| butter-biscuits | grid-24 | top left |
| oat-cookies | grid-24 | top right |
| lebkuchen | grid-24 | bottom left |
| chocolate-wafers | grid-24 | bottom right |
| all-purpose-cleaner | grid-25 | top left |
| glass-cleaner | grid-25 | top right |
| bathroom-cleaner | grid-25 | bottom left |
| kitchen-sponges-6 | grid-25 | bottom right |
| toilet-paper-8 | grid-26 | top left |
| kitchen-roll-4 | grid-26 | top right |
| tissues-box | grid-26 | bottom left |
| bin-bags-20 | grid-26 | bottom right |
| laundry-liquid-1-5l | grid-27 | top left |
| fabric-softener-1l | grid-27 | top right |
| dish-soap-500ml | grid-27 | bottom left |
| dishwasher-tabs-30 | grid-27 | bottom right |
| shampoo-250ml | grid-28 | top left |
| shower-gel-250ml | grid-28 | top right |
| toothpaste-75ml | grid-28 | bottom left |
| toothbrushes-2 | grid-28 | bottom right |
| roll-on-deodorant | grid-29 | top left |
| hand-soap-300ml | grid-29 | top right |
| nappies-size-4 | grid-29 | bottom left |
| baby-wipes-64 | grid-29 | bottom right |
| baby-shampoo-200ml | grid-30 | top left |
| nappy-cream-100ml | grid-30 | top right |
| baby-oat-porridge | grid-30 | bottom left |
| baby-fruit-pouches-4 | grid-30 | bottom right |
