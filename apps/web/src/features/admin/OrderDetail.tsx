import { formatMoney, type AdminOrderDetail, type OrderAddress } from '@store/shared';
import { Link, useParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Seo } from '../../components/Seo';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { TEST_IDS } from '../../lib/test-ids';

import {
  formatWhen,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  stripePaymentUrl,
} from './order-status';
import { OrderTransitions } from './OrderTransitions';
import { useAdminOrder } from './queries';

function Address({ title, address }: { title: string; address: OrderAddress | null }) {
  return (
    <div>
      <h4 className="font-semibold">{title}</h4>
      {address === null ? (
        <p className="text-muted">Same as shipping</p>
      ) : (
        <address className="break-words not-italic">
          {address.fullName}
          <br />
          {address.line1}
          {address.line2 && (
            <>
              <br />
              {address.line2}
            </>
          )}
          <br />
          {address.postalCode} {address.city}
          {address.region && `, ${address.region}`}
          <br />
          {address.country}
          {address.phone && (
            <>
              <br />
              {address.phone}
            </>
          )}
        </address>
      )}
    </div>
  );
}

function Body({ detail }: { detail: AdminOrderDetail }) {
  const { order, payment, customer, history } = detail;
  const { totals } = order;
  const money = (cents: number) => formatMoney(cents, totals.currency);
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to="/admin/orders" className="text-sm font-semibold text-primary-strong underline">
          Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-bold">{order.number}</h2>
          <Badge tone={ORDER_STATUS_TONE[order.status]} data-testid={TEST_IDS.adminOrderStatus}>
            {ORDER_STATUS_LABEL[order.status]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">Placed {formatWhen(order.placedAt)}</p>
      </div>

      <section aria-labelledby="order-actions" className="flex flex-col gap-3">
        <h3 id="order-actions" className="font-display text-lg font-bold">
          Actions
        </h3>
        <OrderTransitions detail={detail} />
      </section>

      <section aria-labelledby="order-items" className="flex flex-col gap-3">
        <h3 id="order-items" className="font-display text-lg font-bold">
          Items
        </h3>
        <div
          className="overflow-x-auto rounded-card border-2 border-line bg-surface"
          data-testid={TEST_IDS.adminTable}
        >
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <caption className="sr-only">Items in {order.number}</caption>
            <thead className="bg-bg text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Product
                </th>
                <th scope="col" className="px-3 py-2">
                  SKU
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Price
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Qty
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-t border-line align-top">
                  <th scope="row" className="max-w-[18rem] px-3 py-2 text-left font-normal">
                    <span className="block break-words font-semibold">{item.productName}</span>
                    <span className="block break-words text-muted">{item.variantName}</span>
                  </th>
                  <td className="break-all px-3 py-2">{item.sku}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {money(item.unitPriceCents)}
                  </td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {money(item.lineTotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">{money(totals.subtotalCents)}</dd>
          <dt>Shipping ({order.shippingMethod.name})</dt>
          <dd className="text-right">{money(totals.shippingCents)}</dd>
          {totals.discountCents > 0 && (
            <>
              <dt>Discount</dt>
              <dd className="text-right">-{money(totals.discountCents)}</dd>
            </>
          )}
          {totals.taxCents > 0 && (
            <>
              <dt>Tax</dt>
              <dd className="text-right">{money(totals.taxCents)}</dd>
            </>
          )}
          <dt className="font-bold">Total</dt>
          <dd className="text-right font-bold">{money(totals.totalCents)}</dd>
        </dl>
      </section>

      <section aria-labelledby="order-customer" className="grid gap-6 sm:grid-cols-2">
        <h3 id="order-customer" className="sr-only">
          Customer and payment
        </h3>
        <div className="flex flex-col gap-4">
          <div>
            <h4 className="font-semibold">Customer</h4>
            <p className="break-all">{order.email}</p>
            {customer ? (
              <p className="break-words text-muted">Account: {customer.name}</p>
            ) : (
              <p className="text-muted">Guest checkout</p>
            )}
          </div>
          <div>
            <h4 className="font-semibold">Payment</h4>
            {payment ? (
              <>
                <p>
                  {payment.status.replace('_', ' ')},{' '}
                  {formatMoney(payment.amountCents, payment.currency)}
                </p>
                {payment.lastError && (
                  <p className="break-words text-danger">{payment.lastError}</p>
                )}
                {payment.providerPaymentIntentId && (
                  <a
                    href={stripePaymentUrl(payment.providerPaymentIntentId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={TEST_IDS.adminStripeLink}
                    className="break-all font-semibold text-primary-strong underline"
                  >
                    Open in Stripe (test mode)
                  </a>
                )}
              </>
            ) : (
              <p className="text-muted">No payment started</p>
            )}
          </div>
          {order.notes && (
            <div>
              <h4 className="font-semibold">Customer note</h4>
              <p className="break-words">{order.notes}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Address title="Shipping address" address={order.shippingAddress} />
          <Address title="Billing address" address={order.billingAddress} />
        </div>
      </section>

      <section aria-labelledby="order-history" className="flex flex-col gap-3">
        <h3 id="order-history" className="font-display text-lg font-bold">
          History
        </h3>
        {history.length === 0 ? (
          <p className="text-muted">No history yet.</p>
        ) : (
          <ol
            className="flex flex-col gap-3 border-l-2 border-line pl-4"
            data-testid={TEST_IDS.adminTimeline}
          >
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.4rem] top-1.5 h-3 w-3 rounded-full bg-primary"
                />
                <p className="font-semibold">
                  {entry.fromStatus
                    ? `${ORDER_STATUS_LABEL[entry.fromStatus]} to ${ORDER_STATUS_LABEL[entry.toStatus]}`
                    : `Created as ${ORDER_STATUS_LABEL[entry.toStatus]}`}
                </p>
                <p className="break-words text-sm text-muted">
                  {formatWhen(entry.at)} by {entry.actor}
                </p>
                {entry.note && <p className="mt-1 break-words">{entry.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function OrderDetail() {
  const { number } = useParams();
  const { data, isPending, error, refetch } = useAdminOrder(number);

  if (isPending && !error) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div role="alert" data-testid="admin-order-missing">
        <Seo title="Order not found" noindex />
        <p className="font-semibold text-danger">
          {missing ? 'That order does not exist.' : 'We could not load this order.'}
        </p>
        {!missing && (
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
        <Link to="/admin/orders" className="mt-2 block font-semibold text-primary-strong underline">
          Back to orders
        </Link>
      </div>
    );
  }
  return (
    <>
      <Seo title={`Order ${data.order.number}`} noindex />
      <Body detail={data} />
    </>
  );
}
