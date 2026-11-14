// Splits each 2x2 grid image into four product shots.
// usage: node crop-grids.mjs <grids.json> <dir with grid-NN.(png|jpg)> <out dir> [only-grid]
// Writes <out>/<slug>-1.png: a square cut from the quadrant around the product (found with trim),
// with real background around it (no padding, so no seams), resized to 1024.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(
  '/home/ubuntu2/projects/1-personal/dev/portfolio-projects/grocery/apps/api/package.json',
);
const sharp = require('sharp');

const [gridsFile, inDir, outDir, only] = process.argv.slice(2);
const grids = JSON.parse(readFileSync(gridsFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

for (const g of grids) {
  if (only && g.grid !== only) continue;
  const src = ['png', 'jpg', 'jpeg', 'webp']
    .map((e) => path.join(inDir, `${g.grid}.${e}`))
    .find((p) => existsSync(p));
  if (!src) continue;
  const { width, height } = await sharp(src).metadata();
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  for (const [k, slug] of g.slugs.entries()) {
    // Inset 2% so the grid line at the seam is never part of the quadrant.
    const inset = Math.round(Math.min(w, h) * 0.02);
    const qx = (k % 2) * w + inset;
    const qy = Math.floor(k / 2) * h + inset;
    const qw = w - 2 * inset;
    const qh = h - 2 * inset;
    const quad = await sharp(src)
      .extract({ left: qx, top: qy, width: qw, height: qh })
      .png()
      .toBuffer();
    const px = await sharp(quad).extract({ left: 4, top: 4, width: 1, height: 1 }).raw().toBuffer();
    const { info } = await sharp(quad)
      .trim({ background: { r: px[0], g: px[1], b: px[2] }, threshold: 18 })
      .toBuffer({ resolveWithObject: true });
    // Product box inside the quadrant.
    const bx = -(info.trimOffsetLeft ?? 0);
    const by = -(info.trimOffsetTop ?? 0);
    const cx = bx + info.width / 2;
    const cy = by + info.height / 2;
    let side = Math.round(Math.max(info.width, info.height) * 1.2);
    side = Math.min(side, qw, qh);
    const left = Math.max(0, Math.min(qw - side, Math.round(cx - side / 2)));
    const top = Math.max(0, Math.min(qh - side, Math.round(cy - side / 2)));
    await sharp(quad)
      .extract({ left, top, width: side, height: side })
      .resize(1024, 1024)
      .png()
      .toFile(path.join(outDir, `${slug}-1.png`));
    console.log(`${g.grid} -> ${slug} (box ${info.width}x${info.height}, square ${side})`);
  }
}
