/**
 * Turns a folder of raw product images into the two WebP sizes the shop serves.
 *
 *   pnpm images:process <input-dir> [--out <dir>]
 *
 * Input files are named `<product-slug>-<n>.<ext>` (png, jpg, jpeg, webp or avif). For each one the
 * script writes, under `apps/web/public/products/<category-slug>/` by default:
 *   <product-slug>-<n>.webp       1200 x 1200
 *   <product-slug>-<n>-600.webp    600 x 600
 *
 * It is a dev tool: `sharp` is a devDependency and nothing here ships in the API.
 */
import { mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { products } from '../src/db/seed/products.ts';

const INPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const SIZES = [
  { px: 1200, suffix: '' },
  { px: 600, suffix: '-600' },
];

// The file name is the only link between a download and a product, so it is parsed strictly.
const categoryBySlug = new Map(products.map((p) => [p.slug, p.categorySlug]));
const NAME_PATTERN = /^(?<slug>[a-z0-9-]+)-(?<n>[1-9])$/;

function parseArgs(argv: string[]): { input: string; out: string } {
  const args = argv.slice(2).filter((a) => a !== '--');
  const outIndex = args.indexOf('--out');
  const out =
    outIndex >= 0
      ? resolve(args[outIndex + 1] ?? '')
      : fileURLToPath(new URL('../../web/public/products', import.meta.url));
  const input = args.find((a, i) => !a.startsWith('--') && i !== outIndex + 1);
  if (!input) throw new Error('usage: pnpm images:process <input-dir> [--out <dir>]');
  return { input: resolve(input), out };
}

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv);
  const files = (await readdir(input)).filter((f) =>
    INPUT_EXTENSIONS.has(extname(f).toLowerCase()),
  );
  if (files.length === 0) throw new Error(`no images found in ${input}`);

  const failures: string[] = [];
  for (const file of files.sort()) {
    const stem = basename(file, extname(file));
    const match = NAME_PATTERN.exec(stem);
    const slug = match?.groups?.slug;
    const category = slug ? categoryBySlug.get(slug) : undefined;
    if (!slug || !category) {
      failures.push(`${file}: name must be <product-slug>-<n> with a known product slug`);
      continue;
    }

    const dir = join(out, category);
    await mkdir(dir, { recursive: true });
    for (const { px, suffix } of SIZES) {
      // `rotate()` applies the EXIF orientation first (phone photos), and cover-crop keeps the
      // whole square filled instead of letterboxing a non-square download.
      await sharp(join(input, file))
        .rotate()
        .resize(px, px, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82 })
        .toFile(join(dir, `${stem}${suffix}.webp`));
    }
    console.log(`${file} -> ${category}/${stem}.webp (+ -600)`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} file(s) skipped:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

await main();
