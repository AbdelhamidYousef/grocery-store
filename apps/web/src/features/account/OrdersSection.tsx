import { formatMoney } from '@store/shared';
import { Link } from 'react-router-dom';

import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { TEST_IDS } from '../../lib/test-ids';

import { useOrders } from './queries';

// Orders exist from phase 9; until then the API answers with an empty list and this page shows
// its empty state. The list rendering is here already so phase 9 only adds the detail page.
export function OrdersSection() {
  const { data, isPending, error, refetch } = useOrders();
  return (
    <section aria-labelledby="orders-heading" data-testid="account-orders">
      <Seo title="Orders" noindex />
      <h2 id="orders-heading" className="font-display text-2xl font-bold">
        Orders
      </h2>
      {isPending && <Skeleton className="mt-4 h-24 w-full rounded-card" />}
      {error && (
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
        <ul className="mt-4 flex flex-col gap-3">
          {data.data.map((order) => (
            <li
              key={order.number}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border-2 border-line bg-surface p-4"
            >
              <span className="font-display font-bold">{order.number}</span>
              <span className="text-muted">{order.status.replace('_', ' ')}</span>
              <span className="font-semibold">{formatMoney(order.totalCents, order.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
