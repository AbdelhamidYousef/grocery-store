import { formatMoney, ProductStatusSchema, type AdminProductRow } from '@store/shared';
import { Link } from 'react-router-dom';

import { Seo } from '../../components/Seo';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button, buttonClasses } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { TEST_IDS } from '../../lib/test-ids';
import { Pagination } from '../catalog/Pagination';

import { AdminSearch } from './AdminSearch';
import { ADMIN_PAGE_SIZE, useAdminList } from './list-params';
import { useAdminProducts } from './queries';

const STATUS_TONE: Record<AdminProductRow['status'], BadgeTone> = {
  active: 'success',
  draft: 'primary',
  archived: 'neutral',
};

function priceRange(row: AdminProductRow): string {
  if (row.minPriceCents === null || row.maxPriceCents === null) return 'No price';
  const min = formatMoney(row.minPriceCents, row.currency);
  return row.minPriceCents === row.maxPriceCents
    ? min
    : `${min} to ${formatMoney(row.maxPriceCents, row.currency)}`;
}

export function ProductsList() {
  const { state, update, hrefFor } = useAdminList(ProductStatusSchema);
  const { data, isPending, error, refetch, isPlaceholderData } = useAdminProducts({
    q: state.q,
    status: state.status,
    page: state.page,
    limit: ADMIN_PAGE_SIZE,
  });
  const filtered = state.q !== '' || state.status !== undefined;

  return (
    <section aria-labelledby="products-heading" data-testid="admin-products">
      <Seo title="Admin products" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="products-heading" className="font-display text-xl font-bold">
          Products
        </h2>
        <Link to="/admin/products/new" className={buttonClasses('primary', 'md')}>
          New product
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
        <AdminSearch
          label="Find products"
          hint="Name, slug or SKU"
          value={state.q}
          onSearch={(q) => update({ q })}
        />
        <Select
          label="Status"
          data-testid={TEST_IDS.adminStatusFilter}
          value={state.status ?? ''}
          onChange={(e) => {
            const parsed = ProductStatusSchema.safeParse(e.target.value);
            update({ status: parsed.success ? parsed.data : undefined });
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      {isPending && !error && <Skeleton className="mt-4 h-64 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the products.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="mt-4" data-testid={TEST_IDS.adminEmpty}>
          <p className="text-muted">
            {state.page > 1
              ? `There is no page ${state.page}: the list is shorter than that.`
              : filtered
                ? 'No products match this search.'
                : 'There are no products yet.'}
          </p>
          {state.page > 1 ? (
            <Link
              to={hrefFor(1)}
              className="mt-2 inline-block font-semibold text-primary-strong underline"
            >
              Back to the first page
            </Link>
          ) : filtered ? (
            <Link to="?" className="mt-2 inline-block font-semibold text-primary-strong underline">
              Clear search and filters
            </Link>
          ) : (
            <Link
              to="/admin/products/new"
              className="mt-2 inline-block font-semibold text-primary-strong underline"
            >
              Create the first product
            </Link>
          )}
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className={isPlaceholderData ? 'opacity-60' : undefined}>
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            {data.meta.total} {data.meta.total === 1 ? 'product' : 'products'}
          </p>
          {/* The table scrolls sideways inside this box; the page itself never does. */}
          <div
            className="mt-2 overflow-x-auto rounded-card border-2 border-line bg-surface"
            data-testid={TEST_IDS.adminTable}
          >
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <caption className="sr-only">Products</caption>
              <thead className="bg-bg text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Product
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Category
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Variants
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Price
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    In stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-line align-middle"
                    data-testid={TEST_IDS.adminRow}
                  >
                    <th scope="row" className="px-3 py-2 font-normal">
                      <div className="flex items-center gap-3">
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt=""
                            width={40}
                            height={40}
                            loading="lazy"
                            className="h-10 w-10 shrink-0 rounded-control object-cover"
                          />
                        ) : (
                          <span className="h-10 w-10 shrink-0 rounded-control bg-line" />
                        )}
                        {/* A 160-character name wraps inside a bounded column, two lines at most. */}
                        <Link
                          to={`/admin/products/${row.id}`}
                          className="line-clamp-2 max-w-[20rem] break-words font-semibold text-primary-strong underline"
                          title={row.name}
                        >
                          {row.name}
                        </Link>
                      </div>
                    </th>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="max-w-[10rem] break-words px-3 py-2">{row.categoryName}</td>
                    <td className="px-3 py-2 text-right">{row.variantCount}</td>
                    <td className="whitespace-nowrap px-3 py-2">{priceRange(row)}</td>
                    <td className="px-3 py-2 text-right">
                      {row.availableStock <= 0 ? (
                        <Badge tone="danger">Sold out</Badge>
                      ) : (
                        row.availableStock
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} hrefFor={hrefFor} />
        </div>
      )}
    </section>
  );
}
