import { productSeeds } from './catalogue.ts';

// The catalogue: 120 made-up products in ten departments, read from docs/plan/data/catalogue.json
// (see catalogue.ts). Plain data on purpose, so it reads like a spreadsheet; the variants, SKUs,
// prices and images are derived from it in expand.ts. All names are made up; nothing here refers
// to a real brand.
export const products = productSeeds;
