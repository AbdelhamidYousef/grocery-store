// Writes one placeholder picture per department into apps/web/public/products/placeholders.
//
//   pnpm --filter @store/api exec tsx ../../tools/make-placeholders.ts
//
// A soft tile in the department's colours with its line icon in the middle and no text, shown for
// every product that has no photo yet. The colours are read from tokens.css and the icon paths
// from lib/department-icons.ts, so the placeholders can never drift from the theme. Square, so it
// sits in the same frame as the 1200 x 1200 photos.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEPARTMENTS } from '../packages/shared/src/departments.ts';

import { DEPARTMENT_ICON_PATHS } from '../apps/web/src/lib/department-icons.ts';

const root = new URL('../apps/web/', import.meta.url);
const tokens = readFileSync(new URL('src/styles/tokens.css', root), 'utf8');
const outDir = fileURLToPath(new URL('public/products/placeholders/', root));
mkdirSync(outDir, { recursive: true });

function theme(slug: string): { accent: string; soft: string; strong: string } {
  const block = new RegExp(`\\[data-dept='${slug}'\\]\\s*\\{([^}]*)\\}`).exec(tokens)?.[1] ?? '';
  const get = (name: string) => new RegExp(`--dept-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1];
  const [accent, soft, strong] = [get('accent'), get('soft'), get('strong')];
  if (!accent || !soft || !strong) throw new Error(`no colours for ${slug} in tokens.css`);
  return { accent, soft, strong };
}

for (const d of DEPARTMENTS) {
  const { accent, soft, strong } = theme(d.slug);
  const paths = DEPARTMENT_ICON_PATHS[d.icon].map((p) => `<path d="${p}"/>`).join('');
  // 24-unit icon scaled 4x and centred in a 200 x 200 tile, on a circle in the accent colour.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${d.name}">
<rect width="200" height="200" fill="${soft}"/>
<circle cx="100" cy="100" r="62" fill="${accent}" fill-opacity="0.55"/>
<g transform="translate(52 52) scale(4)" fill="none" stroke="${strong}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>
`;
  writeFileSync(`${outDir}${d.slug}.svg`, svg);
  console.log(`wrote ${d.slug}.svg`);
}
