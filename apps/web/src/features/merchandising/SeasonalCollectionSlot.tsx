import { Link } from 'react-router-dom';

import { ProductGrid } from '../catalog/ProductGrid';
import { useProducts } from '../catalog/queries';

import { useCollections } from './queries';

// The active seasonal collection for the homepage, hidden when there is none. It is exported (not
// placed): phase 20's homepage slot registry registers it as `seasonal`, so this phase does not
// edit HomePage. "Seasonal" means the collection has a date window; evergreen ones (Eco Picks) do
// not take over the homepage. The API only returns collections that are live right now.
export function SeasonalCollectionSlot({ limit = 4 }: { limit?: number }) {
  const { data: collections } = useCollections();
  const seasonal = collections?.find((c) => c.startsAt !== null || c.endsAt !== null);
  // Rendered as its own component so the products query only exists when there is a collection.
  return seasonal ? <Seasonal slug={seasonal.slug} limit={limit} /> : null;
}

function Seasonal({ slug, limit }: { slug: string; limit: number }) {
  const { data: collections } = useCollections();
  const collection = collections?.find((c) => c.slug === slug);
  const { data } = useProducts({ collection: slug, limit });
  if (!collection || !data || data.data.length === 0) return null;
  return (
    <section
      aria-labelledby="seasonal-heading"
      data-testid="seasonal-collection"
      className="rounded-card p-5 sm:p-6"
      style={{ backgroundColor: `${collection.accentColor}1A` }}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="seasonal-heading" className="font-display text-2xl font-bold">
            {collection.name}
          </h2>
          <p className="max-w-prose text-muted">{collection.description}</p>
        </div>
        <Link
          to={`/collections/${collection.slug}`}
          className="min-h-11 rounded-control font-semibold text-primary-strong underline underline-offset-2"
        >
          See the whole collection
        </Link>
      </div>
      <ProductGrid products={data.data} listId={`collection-${collection.slug}`} />
    </section>
  );
}
