import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { imageRows } from './expand.ts';
import type { ProductSeed } from './expand.ts';

// Where `pnpm images:process` writes the finished WebP files.
const PUBLIC_PRODUCTS = fileURLToPath(new URL('../../../../web/public/products/', import.meta.url));

const hasFile = (p: ProductSeed, n: number): boolean =>
  existsSync(join(PUBLIC_PRODUCTS, p.categorySlug, `${p.slug}-${n}.webp`));

/**
 * Image rows for a product: one per shot whose processed file exists. A product with none gets one
 * row pointing at its department's placeholder illustration (a soft tile in the department colour
 * with a line icon), so the card never shows a broken image. Adding the real file and re-running
 * the seed swaps the row over.
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
      url: `/products/placeholders/${p.department}.svg`,
      alt: `Illustration standing in for the ${p.name} photo, coming soon`,
      width: 1200,
      height: 1200,
      sortOrder: 0,
    },
  ];
}
