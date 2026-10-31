import { formatMoney, OrderStatusSchema } from '@store/shared';
import { Link } from 'react-router-dom';

import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { TEST_IDS } from '../../lib/test-ids';
import { Pagination } from '../catalog/Pagination';

import { AdminSearch } from './AdminSearch';
import { ADMIN_PAGE_SIZE, useAdminList } from './list-params';
import { formatWhen, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from './order-status';
import { useAdminOrders } from './queries';

export function OrdersList() {
  const { state, update, hrefFor } = useAdminList(OrderStatusSchema);
  const { data, isPending, error, refetch, isPlaceholderData } = useAdminOrders({
    q: state.q,
    status: state.status,
    page: state.page,
    limit: ADMIN_PAGE_SIZE,
  });
  const filtered = state.q !== '' || state.status !== undefined;

  return (
    <section aria-labelledby="orders-heading" data-testid="admin-orders">
      <Seo title="Admin orders" noindex />
      <h2 id="orders-heading" className="font-display text-xl font-bold">
        Orders
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-end">
        <AdminSearch
          label="Find orders"
          hint="Order number or customer email"
          value={state.q}
          onSearch={(q) => update({ q })}
        />
        <Select
          label="Status"
          data-testid={TEST_IDS.adminStatusFilter}
          value={state.status ?? ''}
          onChange={(e) => {
            const parsed = OrderStatusSchema.safeParse(e.target.value);
            update({ status: parsed.success ? parsed.data : undefined });
          }}
        >
          <option value="">All statuses</option>
          {OrderStatusSchema.options.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABEL[status]}
            </option>
          ))}
        </Select>
      </div>

      {isPending && !error && <Skeleton className="mt-4 h-64 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the orders.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="mt-4" data-testid={TEST_IDS.adminEmpty}>
          <p className="text-muted">
            {filtered ? 'No orders match this search.' : 'No orders have been placed yet.'}
          </p>
          {filtered && (
            <Link to="?" className="mt-2 inline-block font-semibold text-primary-strong underline">
              Clear search and filters
            </Link>
          )}
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className={isPlaceholderData ? 'opacity-60' : undefined}>
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            {data.meta.total} {data.meta.total === 1 ? 'order' : 'orders'}
          </p>
          {/* The table scrolls sideways inside this box; the page itself never does. */}
          <div
            className="mt-2 overflow-x-auto rounded-card border-2 border-line bg-surface"
            data-testid={TEST_IDS.adminTable}
          >
            <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
              <caption className="sr-only">Orders, newest first</caption>
              <thead className="bg-bg text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Order
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Customer
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Items
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Total
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Placed
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr
                    key={row.number}
                    className="border-t border-line align-middle"
                    data-testid={TEST_IDS.adminRow}
                  >
                    <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal">
                      <Link
                        to={`/admin/orders/${row.number}`}
                        className="font-semibold text-primary-strong underline"
                      >
                        {row.number}
                      </Link>
                    </th>
                    <td className="px-3 py-2">
                      <Badge tone={ORDER_STATUS_TONE[row.status]}>
                        {ORDER_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    {/* An email has no spaces to wrap at, so it breaks anywhere inside its column. */}
                    <td className="max-w-[16rem] break-all px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2 text-right">{row.itemCount}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatMoney(row.totalCents, row.currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatWhen(row.placedAt)}</td>
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
