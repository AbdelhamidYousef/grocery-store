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

## Photos so far

Generated 2026-11-15, tool: Gemini. Grid 01 (four products, one prompt):

| File | Tool | Date | Prompt |
| --- | --- | --- | --- |
| fruit/bananas-1.webp | Gemini | 2026-11-15 | grid-01, top-left |
| fruit/apples-1.webp | Gemini | 2026-11-15 | grid-01, top-right |
| fruit/lemons-1.webp | Gemini | 2026-11-15 | grid-01, bottom-left |
| fruit/strawberries-1.webp | Gemini | 2026-11-15 | grid-01, bottom-right |

The prompt for grid 01 (the full text of every grid is in `image-grids.json`):

> A square 2x2 grid of four separate studio product photos for a grocery delivery app, each item centred alone in its own quadrant with wide empty white margins, nothing crossing the quadrant lines, pure white background everywhere, soft natural light, gentle shadow, photorealistic, no text, no labels, no logos. top-left: a loose bunch of ripe yellow bananas; top-right: four red and green apples with a few leaves; bottom-left: four yellow lemons in a red mesh net; bottom-right: a cardboard punnet filled with bright red strawberries.

The other 29 grids are not generated yet; the products in them use the placeholders.
