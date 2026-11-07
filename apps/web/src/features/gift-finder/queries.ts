import type { ProductCard, ProductListResponse } from '@store/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchProducts } from '../../api/catalog';

// Up to three pages of 100: the whole catalogue (about 125 products) for "a pet lover", a pet's
// share of it (a few dozen) otherwise. In stock only, so the scoring never sees a sold-out card.
const PAGE = 100;
const MAX_PAGES = 3;

async function fetchCandidates(pet: string, signal: AbortSignal): Promise<ProductCard[]> {
  const cards: ProductCard[] = [];
  let page = 1;
  let response: ProductListResponse;
  do {
    response = await fetchProducts(
      { ...(pet !== 'any' && { attr: { pet: [pet] } }), inStock: true, limit: PAGE, page },
      signal,
    );
    cards.push(...response.data);
    page += 1;
  } while (page <= response.meta.totalPages && page <= MAX_PAGES);
  return cards;
}

export function useGiftCandidates(pet: string) {
  return useQuery({
    queryKey: ['gift-finder', 'candidates', pet],
    queryFn: ({ signal }) => fetchCandidates(pet, signal),
  });
}
