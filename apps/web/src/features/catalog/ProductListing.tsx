import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import type { ProductListParams } from '../../api/catalog';
import { Button } from '../../components/ui/Button';
import { PETS } from '../../lib/pets';
import { TEST_IDS } from '../../lib/test-ids';

import { applyListPatch, hasActiveFilters, PAGE_SIZE, useProductListParams } from './list-params';
import { Pagination } from './Pagination';
import { ProductGrid, ProductGridSkeleton } from './ProductGrid';
import { useProducts } from './queries';

interface ProductListingProps {
  /** Analytics id of the list: category slug or `search`. */
  listId: string;
  /** Set on category pages. */
  category?: string;
  /** Set on the search page. */
  q?: string;
}

// The listing shared by /c/:slug and /search: reads the URL, asks the API, and renders the
// states (loading, error, empty, results, page out of range). Filters and sort controls attach
// here in step 5.4; this step is the data and URL plumbing.
export function ProductListing({ listId, category, q }: ProductListingProps) {
  const { query, search, clear } = useProductListParams();

  // The route decides category and query; a stray `?category=` or `?limit=` in the URL must not
  // override it, so those are set last.
  const params: ProductListParams = { ...query, category, q, limit: PAGE_SIZE };
  const { data, isPending, isError, isFetching, refetch } = useProducts(params, {
    keepPrevious: true,
  });

  // New page of results: bring the top of the list into view. (Filter changes do not scroll,
  // see list-params.) Compared with the previous page number so the first render never scrolls.
  const lastPage = useRef(query.page);
  useEffect(() => {
    if (lastPage.current !== query.page) {
      lastPage.current = query.page;
      window.scrollTo({ top: 0 });
    }
  }, [query.page]);

  const filtered = hasActiveFilters(query);
  const hrefFor = (page: number) => `?${applyListPatch(search, { page }).toString()}`;

  if (isError) {
    return (
      <div role="alert" className="rounded-card bg-danger-soft p-6 text-danger">
        <p className="font-bold">We could not load the products.</p>
        <p className="mt-1">Check your connection and try again.</p>
        <Button className="mt-4" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div aria-busy="true">
        <p className="sr-only" role="status">
          Loading products
        </p>
        <ProductGridSkeleton count={PAGE_SIZE / 2} />
      </div>
    );
  }

  const { meta } = data;
  const first = (meta.page - 1) * meta.limit + 1;
  const last = first + data.data.length - 1;

  return (
    <div>
      <p
        data-testid={TEST_IDS.resultCount}
        role="status"
        className="mb-4 text-sm font-semibold text-muted"
      >
        {meta.total === 0
          ? 'No products'
          : meta.total <= meta.limit
            ? `${meta.total} ${meta.total === 1 ? 'product' : 'products'}`
            : `Showing ${first}-${last} of ${meta.total} products`}
      </p>

      {data.data.length === 0 ? (
        <EmptyState
          q={q}
          filtered={filtered}
          pageOutOfRange={meta.total > 0}
          onClear={clear}
          firstPageHref={hrefFor(1)}
        />
      ) : (
        <div aria-busy={isFetching} className={isFetching ? 'opacity-60 transition-opacity' : ''}>
          <ProductGrid products={data.data} listId={listId} eagerCount={4} />
          <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
        </div>
      )}
    </div>
  );
}

interface EmptyStateProps {
  q: string | undefined;
  filtered: boolean;
  pageOutOfRange: boolean;
  onClear: () => void;
  firstPageHref: string;
}

function EmptyState({ q, filtered, pageOutOfRange, onClear, firstPageHref }: EmptyStateProps) {
  return (
    <div
      data-testid={TEST_IDS.emptyState}
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-muted p-8 text-center"
    >
      {pageOutOfRange ? (
        <>
          <h2 className="text-xl font-bold">That page does not exist</h2>
          <p className="text-muted">There are fewer pages of results than that.</p>
          <Link
            to={firstPageHref}
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-display font-semibold text-surface hover:bg-primary-hover"
          >
            Go to the first page
          </Link>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold">{q ? `No results for "${q}"` : 'No products match'}</h2>
          <p className="max-w-prose text-muted">
            {filtered
              ? 'Try removing a filter to see more.'
              : q
                ? 'Try fewer or different words. Search matches whole words, so check the spelling.'
                : 'There is nothing here yet. Have a look at another pet while we restock.'}
          </p>
          {filtered && (
            <Button data-testid={TEST_IDS.clearFilters} onClick={onClear}>
              Clear filters
            </Button>
          )}
          {!filtered && (
            <ul className="flex flex-wrap justify-center gap-2">
              {PETS.map((pet) => (
                <li key={pet.slug} data-pet={pet.accent}>
                  <Link
                    to={`/c/${pet.slug}`}
                    className="inline-flex min-h-11 items-center rounded-full bg-pet-soft px-4 font-display font-semibold text-pet-strong"
                  >
                    {pet.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
