import { formatMoney } from '@store/shared';
import { Link, useSearchParams } from 'react-router-dom';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate } from '../../lib/format';
import { image600 } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';
import { Pagination } from '../catalog/Pagination';

import { OrderStatusBadge } from './OrderStatusBadge';
import { useOrders } from './queries';

// `?page=` is the only state; a missing or broken value (`abc`, `0`, `-3`) means page 1 instead of
// an error page.
function pageFrom(params: URLSearchParams): number {
  const n = Number(params.get('page'));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function OrdersSection() {
  const [params] = useSearchParams();
  const page = pageFrom(params);
  const { data, isPending, error, refetch } = useOrders(page);
  return (
    <section aria-labelledby="orders-heading" data-testid="account-orders">
      <Seo title="Orders" noindex />
      <h2 id="orders-heading" className="font-display text-2xl font-bold">
        Orders
      </h2>
      {isPending && !error && (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <p className="sr-only" role="status">
            Loading your orders
          </p>
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      )}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load your orders.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && data.data.length === 0 && (
        <div className="mt-4" data-testid={TEST_IDS.emptyState}>
          <p className="text-muted">You have not placed an order yet.</p>
          <Link to="/" className="mt-2 inline-block font-semibold text-primary-strong underline">
            Start shopping
          </Link>
        </div>
      )}
      {data && data.data.length > 0 && (
        <>
          <ul className="mt-4 flex flex-col gap-3" data-testid={TEST_IDS.orderList}>
            {data.data.map((order) => (
              <li key={order.number}>
                <Link
                  to={`/account/orders/${encodeURIComponent(order.number)}`}
                  data-testid={TEST_IDS.orderRow}
                  className="flex flex-col gap-3 rounded-card border-2 border-line bg-surface p-4 hover:border-ink sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="break-all font-display text-lg font-bold">
                        {order.number}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {formatDate(order.placedAt ?? order.createdAt)} · {order.itemCount}{' '}
                      {order.itemCount === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    {order.thumbnails.length > 0 && (
                      <span className="flex -space-x-2" aria-hidden="true">
                        {order.thumbnails.map((url, i) => (
                          <img
                            key={`${url}-${i}`}
                            src={image600(url)}
                            alt=""
                            width={40}
                            height={40}
                            loading="lazy"
                            className="h-10 w-10 rounded-control border-2 border-surface bg-line object-cover"
                          />
                        ))}
                      </span>
                    )}
                    <span className="font-display text-lg font-bold">
                      {formatMoney(order.totalCents, order.currency)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            hrefFor={(p) => (p === 1 ? '/account/orders' : `/account/orders?page=${p}`)}
          />
        </>
      )}
    </section>
  );
}
