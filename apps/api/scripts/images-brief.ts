/**
 * Writes docs/images-brief.csv from the seed, so image prompts stay consistent with the catalogue.
 *
 *   pnpm images:brief
 *
 * The lead agent generates each shot, saves it as `apps/api/assets/raw/<slug>-<n>.png`, then runs
 * `pnpm images:process apps/api/assets/raw` and `pnpm db:seed` (which swaps placeholders for the
 * real files).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildImagesBrief } from '../src/db/seed/images.ts';
import { products } from '../src/db/seed/products.ts';

const out = fileURLToPath(new URL('../../../docs/images-brief.csv', import.meta.url));
writeFileSync(out, buildImagesBrief(products));
console.log(`wrote ${out}`);
