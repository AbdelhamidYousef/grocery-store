import type { ProductCard as ProductCardData } from '@store/shared';
import { useEffect } from 'react';

import { Skeleton } from '../../components/ui/Skeleton';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';

import { ProductCard } from './ProductCard';

// 2 columns on phones, 3 from 768px, 4 from 1024px: small screens still get a scannable grid, and
// a card is never narrower than ~160px, which is what the name clamp and price are sized for.
const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4';

interface ProductGridProps {
  products: readonly ProductCardData[];
  /** Identifies the list in analytics: a category slug, `search`, `new-arrivals`... */
  listId: string;
  /** How many cards from the start load eagerly (the first row; the rest are lazy). */
  eagerCount?: number;
  className?: string;
}

export function ProductGrid({ products, listId, eagerCount = 0, className }: ProductGridProps) {
  // Fire once per distinct list (the key is the ids), not on every re-render.
  const idsKey = products.map((p) => p.id).join(',');
  useEffect(() => {
    if (!idsKey) return;
    track({
      name: 'view_item_list',
      listId,
      items: products.map((p) => ({ id: p.id, name: p.name, price: p.price.minCents })),
    });
    // `products` is represented by `idsKey`; depending on the array would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, idsKey]);

  return (
    <ul className={`${GRID} ${className ?? ''}`} data-testid={TEST_IDS.productGrid}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < eagerCount} />
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={GRID} aria-hidden="true" data-testid="product-grid-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-0">
          <Skeleton className="aspect-square rounded-b-none rounded-t-card" />
          <div className="flex flex-col gap-2 p-3 sm:p-4">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}
