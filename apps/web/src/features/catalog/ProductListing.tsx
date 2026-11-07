import type { ProductSort } from '@store/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ProductListParams } from '../../api/catalog';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { UnitPriceNote } from '../../components/ui/UnitPrice';
import { PETS } from '../../lib/pets';
import { TEST_IDS } from '../../lib/test-ids';
import { ActivePetNote } from '../pets/ActivePetNote';
import { usePetDefaults } from '../pets/use-pet-defaults';

import { AppliedFilters } from './AppliedFilters';
import { FilterPanel } from './FilterPanel';
import { defaultSort, SORT_LABELS, sortOptions } from './filters';
import { applyListPatch, hasActiveFilters, PAGE_SIZE, useProductListParams } from './list-params';
import { Pagination } from './Pagination';
import { ProductGrid, ProductGridSkeleton } from './ProductGrid';
import { useProducts } from './queries';
import { QuickChips } from './QuickChips';

interface ProductListingProps {
  /** Analytics id of the list: category slug or `search`. */
  listId: string;
  /** Set on category pages. */
  category?: string;
  /** Set on the search page. */
  q?: string;
  /** Set on collection pages. */
  collection?: string;
  /** Set on brand pages: the brand is the page, so it is fixed and its facet is hidden. */
  brand?: string;
  /**
   * Where the active pet may pre-filter this list: 'any' (search) or the pet attribute value of
   * the category page ('dog'). Left out on brand and collection pages, which are curated lists.
   */
  petScope?: string;
}

// The listing shared by /c/:slug and /search: reads the URL, asks the API, and renders the
// states (loading, error, empty, results, page out of range). Filters and sort controls attach
// here: a sidebar on desktop, a drawer on phones, both built from the API's `facets`.
export function ProductListing({
  listId,
  category,
  q,
  collection,
  brand,
  petScope,
}: ProductListingProps) {
  const { query, search, update, clear } = useProductListParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { waiting: waitingForPet } = usePetDefaults(petScope);

  // The route decides category and query; a stray `?category=` or `?limit=` in the URL must not
  // override it, so those are set last.
  const params: ProductListParams = {
    ...query,
    category,
    q,
    collection,
    ...(brand && { brand: [brand] }),
    limit: PAGE_SIZE,
  };
  const { data, isPending, isError, isFetching, refetch } = useProducts(params, {
    keepPrevious: true,
    // Hold the first request until the active pet's filters are in the URL: one request, not two.
    enabled: !waitingForPet,
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

  if (isPending || waitingForPet) {
    return (
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8" aria-busy="true">
        <p className="sr-only" role="status">
          Loading products
        </p>
        <div className="mb-4 hidden flex-col gap-3 lg:flex" aria-hidden="true">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-32 w-full" />
        </div>
        <ProductGridSkeleton count={PAGE_SIZE / 2} />
      </div>
    );
  }

  const { meta } = data;
  // On a brand page the brand is the page itself, so offering other brands would be a trap.
  const facets = brand ? { ...data.facets, brand: [] } : data.facets;
  const first = (meta.page - 1) * meta.limit + 1;
  const last = first + data.data.length - 1;

  const hasSearch = q !== undefined;
  const currency = data.data[0]?.price.currency ?? 'EUR';
  const activeCount =
    (query.inStock ? 1 : 0) +
    (query.minPrice !== undefined || query.maxPrice !== undefined ? 1 : 0) +
    (query.brand?.length ?? 0) +
    (query.tag?.length ?? 0) +
    (query.badge?.length ?? 0) +
    Object.values(query.attr).reduce((n, v) => n + v.length, 0);

  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <aside aria-label="Filters" className="hidden lg:block">
        {/* Deliberately NOT sticky and NOT a scroll box. The sidebar used to be
            `sticky max-h-[100vh-10rem] overflow-y-auto`; on a 1280x800 laptop that box ended
            between the "Age stage" heading and its checkboxes, so the heading looked like an
            empty group and the options sat behind an invisible inner scroll. Now the page scrolls
            the whole sidebar (the long material list already scrolls in its own small box). */}
        <div className="pr-2">
          <h2 className="mb-4 font-display text-xl font-bold">Filters</h2>
          <FilterPanel facets={facets} query={query} currency={currency} update={update} />
        </div>
      </aside>

      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          {/* role=status is a polite live region: after a filter changes, a screen reader
              announces the new count without moving focus. */}
          <p
            data-testid={TEST_IDS.resultCount}
            role="status"
            className="text-sm font-semibold text-muted"
          >
            {meta.total === 0
              ? 'No products'
              : meta.total <= meta.limit
                ? `${meta.total} ${meta.total === 1 ? 'product' : 'products'}`
                : `Showing ${first}-${last} of ${meta.total} products`}
          </p>
          <div className="flex items-end gap-3">
            <Button
              variant="secondary"
              data-testid={TEST_IDS.filtersToggle}
              aria-haspopup="dialog"
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden"
            >
              Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
            <Select
              label="Sort by"
              data-testid={TEST_IDS.sortSelect}
              value={query.sort ?? defaultSort(hasSearch)}
              onChange={(e) => {
                const sort = e.target.value as ProductSort;
                // The default is the absence of a parameter, so clean URLs stay clean.
                update({ sort: sort === defaultSort(hasSearch) ? undefined : sort });
              }}
              className="w-auto min-w-44"
            >
              {sortOptions(hasSearch).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ActivePetNote query={query} update={update} />
        <QuickChips
          chips={brand ? data.chips.filter((c) => c.kind !== 'brand') : data.chips}
          query={query}
          update={update}
        />
        <AppliedFilters
          query={query}
          facets={facets}
          currency={currency}
          update={update}
          onClear={clear}
        />

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
            {/* h1 -> h3 (the cards) skipped a level whenever the Filters sidebar is hidden. */}
            <h2 className="sr-only">Products</h2>
            <ProductGrid products={data.data} listId={listId} eagerCount={4} />
            {data.data.some((p) => p.unitPrice) && <UnitPriceNote className="mt-4" />}
            <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
          </div>
        )}
      </div>

      <Dialog
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        placement="left"
      >
        <FilterPanel
          facets={facets}
          query={query}
          currency={currency}
          update={update}
          testId="filters-drawer"
        />
        <Button onClick={() => setDrawerOpen(false)} className="sticky bottom-0">
          Show {meta.total} {meta.total === 1 ? 'product' : 'products'}
        </Button>
      </Dialog>
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
