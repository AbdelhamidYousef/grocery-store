import { Link, useParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate } from '../../lib/format';
import { TEST_IDS } from '../../lib/test-ids';
import { OrderAddress, OrderSummary } from '../checkout/OrderSummary';
import { ReorderButton } from '../reorder/ReorderButton';
import { ReturnsSection } from '../returns/ReturnsSection';

import { TIMELINE_LABEL } from './order-status';
import { OrderStatusBadge } from './OrderStatusBadge';
import { useOrder } from './queries';

// One order of the signed-in customer: where it is, what is in it, where it is going. The summary
// is the same component the confirmation page uses, so the two read identically.
export function OrderDetail() {
  const { number = '' } = useParams();
  const { data: order, isPending, error, refetch } = useOrder(number);

  const back = (
    <Link to="/account/orders" className="font-semibold text-primary-strong underline">
      Back to orders
    </Link>
  );

  if (isPending && !error) {
    return (
      <section aria-busy="true" data-testid={TEST_IDS.pageOrderDetail} data-state="loading">
        <p className="sr-only" role="status">
          Loading your order
        </p>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-48 w-full" />
      </section>
    );
  }
  if (error || !order) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <section data-testid={TEST_IDS.pageOrderDetail} data-state={missing ? 'not-found' : 'error'}>
        <Seo title="Order" noindex />
        <h2 className="font-display text-2xl font-bold">
          {missing ? "We can't find that order" : 'We could not load this order'}
        </h2>
        <p className="mt-2 text-muted">
          {missing
            ? 'It may belong to a different account, or the number may be mistyped.'
            : 'Please try again in a moment.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {!missing && (
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          )}
          {back}
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid={TEST_IDS.pageOrderDetail}
      data-state="ready"
      aria-labelledby="order-heading"
    >
      <Seo title={`Order ${order.number}`} noindex />
      <p>{back}</p>
      <h2
        id="order-heading"
        className="mt-3 flex flex-wrap items-center gap-3 font-display text-2xl font-bold"
      >
        <span className="break-all">Order {order.number}</span>
        <OrderStatusBadge status={order.status} />
      </h2>
      <p className="mt-1 text-muted">
        Placed {formatDate(order.placedAt ?? order.createdAt, true)}
      </p>
      <p className="mt-1">
        <Link
          to={`/withdraw?number=${encodeURIComponent(order.number)}`}
          className="font-semibold text-primary-strong underline"
          data-testid="withdraw-link"
        >
          Withdraw from contract
        </Link>
      </p>

      {order.status !== 'pending_payment' && order.status !== 'cancelled' && (
        <ReorderButton orderNumber={order.number} />
      )}

      {order.timeline.length > 0 && (
        <ol
          aria-label="Order progress"
          data-testid={TEST_IDS.orderTimeline}
          className="mt-6 flex flex-col gap-0 border-l-2 border-line pl-5"
        >
          {order.timeline.map((step, i) => (
            <li
              key={`${step.status}-${step.at}`}
              data-testid={TEST_IDS.orderTimelineStep}
              data-status={step.status}
              className="relative pb-5 last:pb-0"
            >
              <span
                aria-hidden="true"
                className={
                  i === order.timeline.length - 1
                    ? 'absolute -left-[1.7rem] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-primary-soft'
                    : 'absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-ink'
                }
              />
              <p className="font-semibold">{TIMELINE_LABEL[step.status]}</p>
              <p className="text-sm text-muted">{formatDate(step.at, true)}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8 grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold">Items</h3>
          <div className="mt-3">
            <OrderSummary items={order.items} totals={order.totals} />
          </div>
          <ReturnsSection
            orderNumber={order.number}
            currency={order.totals.currency}
            items={order.items}
            status={order.status}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <OrderAddress title="Shipping to" address={order.shippingAddress} />
          <div>
            <h3 className="font-display text-lg font-bold">Shipping method</h3>
            <p className="mt-1 break-words">{order.shippingMethod.name}</p>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Contact</h3>
            <p className="mt-1 break-all">{order.email}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
