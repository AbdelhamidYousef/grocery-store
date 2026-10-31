import type { OrderStatus } from '@store/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { buttonClasses, Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { TEST_IDS } from '../../lib/test-ids';
import { useSlow } from '../../lib/use-slow';

import {
  isPendingStatus,
  POLL_FOR_MS,
  usePlacedOrder,
  useOrderStatus,
  useRefreshAfterPaid,
} from './confirmation-queries';
import { OrderAddress, OrderSummary } from './OrderSummary';
import { usePurchaseTracking } from './purchase-tracking';

type View = 'pending' | 'paid' | 'timeout' | 'failed' | 'cancelled' | 'not-found' | 'error';

// Paid and anything after paid (the shop may already be packing it by the time this page opens).
const PAID: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

const COPY: Record<View, { title: string; body: string }> = {
  pending: {
    title: 'Confirming your payment…',
    body: 'This usually takes a few seconds. Please keep this page open.',
  },
  paid: {
    title: 'Thank you, your order is paid!',
    body: 'A confirmation is on its way to your email.',
  },
  timeout: {
    title: 'We are still confirming your payment',
    body: 'It is taking longer than usual, which can happen when the payment provider is slow to tell us. Please do not pay again. You do not need to wait here: you will get an email as soon as the payment is confirmed, and you can come back to this page to check.',
  },
  failed: {
    title: 'Your payment did not go through',
    body: 'You have not been charged. Your cart is still there, so you can try again.',
  },
  cancelled: {
    title: 'This order was cancelled',
    body: 'If you paid, the money is on its way back to you.',
  },
  'not-found': {
    title: 'We cannot find that order here',
    body: 'Orders can only be opened from the browser or account that placed them.',
  },
  error: {
    title: 'We could not check your order',
    body: 'The server did not answer. Your payment is not affected.',
  },
};

export function Confirmation({ number }: { number: string }) {
  const [params] = useSearchParams();
  // Fixed for this visit so re-renders do not extend the 30 s polling window.
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), POLL_FOR_MS);
    return () => clearTimeout(timer);
  }, [startedAt]);

  const status = useOrderStatus(number, startedAt);
  const order = usePlacedOrder(number);
  const waking = useSlow(status.isPending, 4_000);

  const current = status.data;
  const paid = current !== undefined && PAID.includes(current.status);
  usePurchaseTracking(order.data, paid);
  useRefreshAfterPaid(paid);

  let view: View;
  if (status.error) {
    view = status.error instanceof ApiError && status.error.status === 404 ? 'not-found' : 'error';
  } else if (paid) view = 'paid';
  else if (current && !isPendingStatus(current.status)) view = 'cancelled';
  else if (current?.paymentStatus === 'failed' || params.get('redirect_status') === 'failed') {
    view = 'failed';
  } else if (expired) view = 'timeout';
  else view = 'pending';

  const copy = COPY[view];
  const busy = view === 'pending';

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageConfirmation}>
      <Seo title="Order confirmation" noindex />
      <div
        className="rounded-card border-2 border-ink bg-surface p-5 shadow-card sm:p-8"
        data-testid={TEST_IDS.confirmationStatus}
        data-state={view}
        aria-busy={busy}
      >
        <p className="text-sm font-semibold text-muted">
          Order{' '}
          <span
            className="break-all font-display text-base text-ink"
            data-testid={TEST_IDS.confirmationOrderNumber}
          >
            {number}
          </span>
        </p>
        <h1 className="mt-2 flex items-center gap-3 font-display text-3xl font-bold sm:text-4xl">
          {busy && <Spinner label={null} className="h-7 w-7 shrink-0" />}
          <span role="status" className="min-w-0 break-words">
            {copy.title}
          </span>
        </h1>
        <p className="mt-2 text-lg">{copy.body}</p>

        {waking && busy && !current && (
          <p
            className="mt-4 rounded-control border-2 border-primary bg-primary-soft p-3 font-semibold text-primary-strong"
            data-testid={TEST_IDS.confirmationWakingUp}
          >
            Our server is waking up after a nap (this demo runs on free hosting), so the first
            answer can take up to a minute. Hang tight, your order is safe.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {view === 'failed' && (
            <Link to="/checkout" className={buttonClasses('primary', 'lg')}>
              Try again
            </Link>
          )}
          {view === 'timeout' && (
            <Button
              size="lg"
              data-testid={TEST_IDS.confirmationCheckAgain}
              onClick={() => {
                // A fresh 30 s polling window, for the webhook that is merely late.
                setExpired(false);
                setStartedAt(Date.now());
              }}
            >
              Check again
            </Button>
          )}
          {view === 'error' && (
            <Button
              size="lg"
              onClick={() => {
                void status.refetch();
              }}
            >
              Try again
            </Button>
          )}
          <Link to="/" className={buttonClasses(view === 'paid' ? 'primary' : 'secondary', 'lg')}>
            Continue shopping
          </Link>
        </div>
      </div>

      {order.data && view !== 'not-found' && (
        <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="order-items-heading" className="min-w-0">
            <h2 id="order-items-heading" className="font-display text-2xl font-bold">
              Your order
            </h2>
            <div className="mt-4">
              <OrderSummary items={order.data.items} totals={order.data.totals} />
            </div>
          </section>
          <section aria-label="Delivery" className="flex min-w-0 flex-col gap-5">
            <OrderAddress title="Shipping to" address={order.data.shippingAddress} />
            <div>
              <h3 className="font-display text-lg font-bold">Shipping method</h3>
              <p className="mt-1 break-words">{order.data.shippingMethod.name}</p>
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Contact</h3>
              <p className="mt-1 break-all">{order.data.email}</p>
            </div>
          </section>
        </div>
      )}
    </Container>
  );
}
