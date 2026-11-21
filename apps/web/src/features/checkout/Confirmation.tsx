import type { OrderStatus } from '@store/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { buttonClasses, Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useT, type StringKey } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';
import { useSlow } from '../../lib/use-slow';
import { deliverySentence } from '../delivery/slots';

import {
  isPendingStatus,
  POLL_FOR_MS,
  usePlacedOrder,
  useOrderStatus,
  useRefreshAfterPaid,
} from './confirmation-queries';
import { deliveryMethodName } from './delivery-method';
import { OrderAddress, OrderSummary } from './OrderSummary';
import { usePurchaseTracking } from './purchase-tracking';

type View = 'pending' | 'paid' | 'timeout' | 'failed' | 'cancelled' | 'not-found' | 'error';

// Paid and anything after paid (the shop may already be packing it by the time this page opens).
const PAID: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

const COPY: Record<View, { title: StringKey; body: StringKey }> = {
  pending: {
    title: 'checkout.confirmation.pending.title',
    body: 'checkout.confirmation.pending.body',
  },
  paid: { title: 'checkout.confirmation.paid.title', body: 'checkout.confirmation.paid.body' },
  timeout: {
    title: 'checkout.confirmation.timeout.title',
    body: 'checkout.confirmation.timeout.body',
  },
  failed: {
    title: 'checkout.confirmation.failed.title',
    body: 'checkout.confirmation.failed.body',
  },
  cancelled: {
    title: 'checkout.confirmation.cancelled.title',
    body: 'checkout.confirmation.cancelled.body',
  },
  'not-found': {
    title: 'checkout.confirmation.notFound.title',
    body: 'checkout.confirmation.notFound.body',
  },
  error: {
    title: 'checkout.confirmation.error.title',
    body: 'checkout.confirmation.error.body',
  },
};

export function Confirmation({ number }: { number: string }) {
  const { t } = useT();
  const { locale } = useFormat();
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
      <Seo title={t('checkout.confirmation.seoTitle')} noindex />
      <div
        className="rounded-card border-2 border-ink bg-surface p-5 shadow-card sm:p-8"
        data-testid={TEST_IDS.confirmationStatus}
        data-state={view}
        aria-busy={busy}
      >
        <p className="text-sm font-semibold text-muted">
          {t('checkout.confirmation.order')}{' '}
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
            {t(copy.title)}
          </span>
        </h1>
        <p className="mt-2 text-lg">{t(copy.body)}</p>

        {waking && busy && !current && (
          <p
            className="mt-4 rounded-control border-2 border-primary bg-primary-soft p-3 font-semibold text-primary-strong"
            data-testid={TEST_IDS.confirmationWakingUp}
          >
            {t('checkout.confirmation.waking')}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {view === 'failed' && (
            <Link to="/checkout" className={buttonClasses('primary', 'lg')}>
              {t('checkout.confirmation.tryAgain')}
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
              {t('checkout.confirmation.checkAgain')}
            </Button>
          )}
          {view === 'error' && (
            <Button
              size="lg"
              onClick={() => {
                void status.refetch();
              }}
            >
              {t('checkout.confirmation.tryAgain')}
            </Button>
          )}
          <Link to="/" className={buttonClasses(view === 'paid' ? 'primary' : 'secondary', 'lg')}>
            {t('checkout.confirmation.continueShopping')}
          </Link>
        </div>
      </div>

      {order.data && view !== 'not-found' && (
        <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="order-items-heading" className="min-w-0">
            <h2 id="order-items-heading" className="font-display text-2xl font-bold">
              {t('checkout.confirmation.yourOrder')}
            </h2>
            <div className="mt-4">
              <OrderSummary
                items={order.data.items}
                totals={order.data.totals}
                authorizedCents={order.data.authorizedCents}
                capturedCents={order.data.capturedCents}
              />
            </div>
          </section>
          <section
            aria-label={t('checkout.confirmation.delivery')}
            className="flex min-w-0 flex-col gap-5"
          >
            <OrderAddress
              title={t('checkout.address.shippingTo')}
              address={order.data.shippingAddress}
            />
            {order.data.delivery && (
              <div>
                <h3 className="font-display text-lg font-bold">{t('delivery.window.heading')}</h3>
                <p
                  data-testid={TEST_IDS.deliveryOrderWindow}
                  className="mt-1 break-words font-semibold"
                >
                  {deliverySentence(order.data.delivery, locale, t)}
                </p>
              </div>
            )}
            <div>
              <h3 className="font-display text-lg font-bold">
                {t('checkout.confirmation.shippingMethod')}
              </h3>
              <p className="mt-1 break-words">{deliveryMethodName(order.data.shippingMethod, t)}</p>
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">
                {t('checkout.confirmation.contact')}
              </h3>
              <p className="mt-1 break-all">{order.data.email}</p>
            </div>
          </section>
        </div>
      )}
    </Container>
  );
}
