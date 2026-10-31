import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { imageRows } from './expand.ts';
import type { Pet, ProductSeed } from './expand.ts';

// Where `pnpm images:process` writes the finished WebP files.
const PUBLIC_PRODUCTS = fileURLToPath(new URL('../../../../web/public/products/', import.meta.url));

const hasFile = (p: ProductSeed, n: number): boolean =>
  existsSync(join(PUBLIC_PRODUCTS, p.categorySlug, `${p.slug}-${n}.webp`));

/**
 * Image rows for a product: one per shot whose processed file exists. A product with none gets one
 * row pointing at its pet's placeholder illustration, so the card never shows a broken image.
 * Adding the real files and re-running the seed swaps the rows over. (Checking each shot also
 * covers a product whose second "detail" image was never generated.)
 */
export function imageRowsFor(
  p: ProductSeed,
  fileExists: (p: ProductSeed, n: number) => boolean = hasFile,
) {
  const real = imageRows(p).filter((img) => fileExists(p, img.n));
  if (real.length > 0) return real.map((img, i) => ({ ...img, sortOrder: i }));
  return [
    {
      n: 1,
      url: `/products/placeholders/${p.pet}.svg`,
      alt: `Illustration standing in for the ${p.name} photo, coming soon`,
      width: 1200,
      height: 1200,
      sortOrder: 0,
    },
  ];
}

// ---------- the prompt brief for the image pipeline ----------

// The tail every prompt shares, so the whole catalogue looks like one shoot. The background colour
// is the pet's accent, matching the credits of the first 40 images.
const BACKGROUND: Record<Pet, string> = {
  dog: 'warm amber',
  cat: 'soft violet',
  bird: 'soft teal',
  fish: 'light sky blue (#BDE3F7)',
  small: 'fresh lime green',
  reptile: 'soft sage green (#CDE8C6)',
};

export const styleSuffix = (pet: Pet) =>
  `Square 1:1 e-commerce product photo, the product alone centred, soft studio lighting, seamless pastel ${BACKGROUND[pet]} background, gentle shadow, crisp detail, playful but premium look. No people, no animals, no text, no logos, no watermark.`;

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * One CSV row per shot: slug, shot number, subject prompt, shared style suffix and the raw file
 * name the lead agent saves the generated image under. Full prompt = prompt + " " + style_suffix
 * (prefixed "Generate an image: " for the first shot, as in CREDITS.md).
 */
export function buildImagesBrief(products: readonly ProductSeed[]): string {
  const rows = [['slug', 'category', 'shot', 'prompt', 'style_suffix', 'raw_file'].join(',')];
  for (const p of products) {
    for (const img of imageRows(p)) {
      const prompt =
        img.n === 1
          ? `${p.look}.`
          : `A close-up detail shot of exactly this same product, filling the frame, showing its ${p.material} texture and finish.`;
      rows.push(
        [
          p.slug,
          p.categorySlug,
          String(img.n),
          prompt,
          styleSuffix(p.pet),
          `apps/api/assets/raw/${p.slug}-${img.n}.png`,
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return rows.join('\n') + '\n';
}
