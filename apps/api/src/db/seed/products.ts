import { birdProducts } from './products-bird.ts';
import { catProducts } from './products-cat.ts';
import { dogProducts } from './products-dog.ts';
import { fishProducts } from './products-fish.ts';
import { smallProducts } from './products-small.ts';

// Plain data on purpose: the catalog reads like a spreadsheet, and the variant matrix, SKUs,
// prices and images are derived from it in expand.ts. One file per pet keeps each readable. All
// names are made up; nothing here refers to a real brand, and no live animals are sold.
export const products = [
  ...dogProducts,
  ...catProducts,
  ...birdProducts,
  ...fishProducts,
  ...smallProducts,
];
