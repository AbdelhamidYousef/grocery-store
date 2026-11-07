import type { Suggestions } from '@store/shared';

import * as catalogRepo from '../catalog/repo.ts';

import * as repo from './repo.ts';

export const SUGGEST_LIMITS = { products: 5, categories: 3, brands: 3 } as const;

// Built for GUESTS only, always: the response is cached publicly (see the router), so it carries
// the list price and never a member price, whoever asked.
export async function suggest(q: string): Promise<Suggestions> {
  const [productRows, categories, brands] = await Promise.all([
    repo.suggestProducts(q, SUGGEST_LIMITS.products),
    repo.suggestCategories(q, SUGGEST_LIMITS.categories),
    repo.suggestBrands(q, SUGGEST_LIMITS.brands),
  ]);
  const images = await catalogRepo.listPrimaryImages(productRows.map((p) => p.id));
  const imageOf = new Map(images.map((i) => [i.productId, i]));
  return {
    products: productRows.map((p) => ({
      name: p.name,
      slug: p.slug,
      imageUrl: imageOf.get(p.id)?.url ?? null,
      imageAlt: imageOf.get(p.id)?.alt ?? '',
      priceFromCents: p.minCents,
      currency: p.currency,
    })),
    categories,
    brands,
  };
}
