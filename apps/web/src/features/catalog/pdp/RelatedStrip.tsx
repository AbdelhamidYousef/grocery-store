import { useRecommendations } from '../queries';

import { ProductRail } from './ProductRail';

// "You may also like": the editor's related picks, else the same category (the API decides).
export function RelatedStrip({ productSlug }: { productSlug: string }) {
  const { data } = useRecommendations(productSlug);
  if (!data || data.related.length === 0) return null;
  return (
    <section aria-labelledby="related-heading" data-testid="related" className="mt-10">
      <h2 id="related-heading" className="font-display text-2xl font-bold">
        You may also like
      </h2>
      <div className="mt-4">
        <ProductRail cards={data.related} label="Related products" testId="related-list" />
      </div>
    </section>
  );
}
