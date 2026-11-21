import type { CategoryAttributes } from '../schema/categories.ts';

import { departmentSeeds } from './catalogue.ts';

export type CategorySeed = {
  slug: string;
  name: string;
  description: string;
  attributes?: CategoryAttributes;
  children: { slug: string; name: string; description: string }[];
};

// Ten departments, each with two to four subcategories, read from the catalogue file. Every
// department has its own accent colour; the UI themes that part of the shop with it.
export const categories: CategorySeed[] = departmentSeeds;
