import { useState } from 'react';

import { readRecentlyViewed } from '../../../lib/recently-viewed';
import { useProductsByIds } from '../queries';

import { ProductRail } from './ProductRail';

// The strip itself. The ids are read once when it first renders (before the product page records
// its own view), so it never flickers when the list changes underneath it. Products that are no
// longer on sale are simply missing from the API's answer.
export function RecentlyViewed({
  excludeId,
  heading = 'Recently viewed',
  max = 8,
}: {
  /** The product page's own id: you are looking at it already. */
  excludeId?: string;
  heading?: string;
  max?: number;
}) {
  const [ids] = useState(() =>
    readRecentlyViewed()
      .filter((id) => id !== excludeId)
      .slice(0, max),
  );
  const { data } = useProductsByIds(ids);
  if (ids.length === 0 || !data || data.length === 0) return null;
  return (
    <section
      aria-labelledby="recently-viewed-heading"
      data-testid="recently-viewed"
      className="mt-10"
    >
      <h2 id="recently-viewed-heading" className="font-display text-2xl font-bold">
        {heading}
      </h2>
      <div className="mt-4">
        <ProductRail cards={data} label={heading} testId="recently-viewed-list" />
      </div>
    </section>
  );
}
