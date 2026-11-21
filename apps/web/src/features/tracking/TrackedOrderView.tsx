import { riderProgress, type TrackedOrder } from '@store/shared';
import { useEffect, useMemo, useState } from 'react';

import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';
import { deliverySentence } from '../delivery/slots';

// The four words a shopper of a grocery shop knows. The engine's statuses keep their names; this is
// only how they are shown.
const STEPS = ['received', 'packing', 'onTheWay', 'delivered'] as const;
const STEP_OF_STATUS = {
  pending_payment: -1,
  paid: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
  cancelled: -1,
  refunded: -1,
} as const;

// The rider is simulated: where the bag "is" comes from the hand-over time and the end of the window
// (`riderProgress`, shared and tested), re-read every 30 seconds with the page itself.
function RiderCard({ order }: { order: TrackedOrder }) {
  const { t, tn } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const f = order.fulfilment;
  if (order.status !== 'shipped' || !f?.dispatchedAt || !f.riderName) return null;
  const dispatched = new Date(f.dispatchedAt);
  const end = order.delivery
    ? new Date(order.delivery.to)
    : new Date(dispatched.getTime() + 30 * 60_000);
  const p = riderProgress(dispatched, end, new Date(now));
  const percent = Math.round(p.fraction * 100);
  return (
    <div
      data-testid={TEST_IDS.trackRider}
      className="mt-4 rounded-card border-2 border-primary bg-primary-soft p-4"
    >
      <p className="font-display text-lg font-bold">
        {p.arrived
          ? t('track.rider.arrived', { rider: f.riderName })
          : t('track.rider.heading', { rider: f.riderName })}
      </p>
      <div
        role="progressbar"
        aria-label={t('track.rider.progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-3 overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 font-semibold" data-testid={TEST_IDS.trackRiderEta}>
        {p.arrived
          ? t('track.rider.arriving')
          : p.minutesAway <= 1
            ? t('track.rider.arriving')
            : tn('track.rider.minutes', p.minutesAway)}
      </p>
      <p className="mt-1 text-sm text-muted">{t('track.rider.demo')}</p>
    </div>
  );
}

export function TrackedOrderView({ order }: { order: TrackedOrder }) {
  const { t } = useT();
  const step = STEP_OF_STATUS[order.status];
  const { locale } = useFormat();
  // Times are shown in UTC (the page says so) in the store view's language.
  const when = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }),
    [locale],
  );
  const formatWhen = (iso: string) =>
    t('account.tracking.when', { date: when.format(new Date(iso)) });

  return (
    <section
      aria-labelledby="tracked-heading"
      className="mt-8 rounded-card border-2 border-line bg-surface p-5 sm:p-6"
      data-testid={TEST_IDS.trackResult}
    >
      <h2 id="tracked-heading" className="font-display text-2xl font-bold">
        <span className="break-all">{t('account.order.title', { number: order.orderNumber })}</span>
      </h2>
      <p className="mt-1 text-lg">
        {t('account.tracking.status')}{' '}
        <strong data-testid={TEST_IDS.trackStatus}>
          {t(`account.tracking.state.${order.status}`)}
        </strong>
      </p>
      {order.delivery && (
        <p data-testid={TEST_IDS.deliveryOrderWindow} className="mt-1 font-semibold">
          {deliverySentence(order.delivery, locale, t)}
        </p>
      )}
      {step >= 0 && (
        <ol
          aria-label={t('track.steps.label')}
          data-testid={TEST_IDS.trackSteps}
          className="mt-4 grid grid-cols-4 gap-2"
        >
          {STEPS.map((name, i) => (
            <li
              key={name}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'min-w-0 break-words rounded-control border-2 px-2 py-2 text-center text-sm font-semibold',
                i < step && 'border-primary bg-primary text-surface',
                i === step && 'border-primary bg-primary-soft text-primary-strong',
                i > step && 'border-line text-muted',
              )}
            >
              {t(`track.step.${name}`)}
            </li>
          ))}
        </ol>
      )}
      <RiderCard order={order} />
      {order.tracking && (
        <p className="mt-1 text-muted">
          {t('account.tracking.carrier', { carrier: order.tracking.carrier })}{' '}
          <span className="font-semibold text-ink">{order.tracking.trackingNumber}</span>
        </p>
      )}
      <h3 className="mt-6 font-display text-xl font-bold">{t('account.tracking.progress')}</h3>
      <ol
        aria-label={t('account.tracking.progressLabel')}
        data-testid={TEST_IDS.trackTimeline}
        className="mt-3 flex flex-col border-l-2 border-line pl-5"
      >
        {order.timeline.map((step, i) => (
          <li
            key={`${step.status}-${step.at}`}
            data-testid={TEST_IDS.trackTimelineStep}
            aria-current={i === order.timeline.length - 1 ? 'step' : undefined}
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
            <p className="font-semibold">{t(`account.tracking.state.${step.status}`)}</p>
            <p className="text-sm text-muted">{formatWhen(step.at)}</p>
          </li>
        ))}
      </ol>
      {order.changes.length > 0 && (
        <div
          data-testid={TEST_IDS.trackChanges}
          className="mt-6 rounded-card border-2 border-primary bg-primary-soft p-4"
        >
          <h3 className="font-display text-xl font-bold">{t('subs.order.heading')}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {order.changes.map((c, i) => (
              <li key={i} className="break-words text-sm">
                <span className="font-semibold">{c.name}</span>{' '}
                {c.picked === 0
                  ? t('subs.order.missing')
                  : t('subs.order.short', { picked: c.picked, quantity: c.quantity })}{' '}
                {c.replacement
                  ? t('subs.track.replacement', {
                      name: c.replacement.name,
                      quantity: c.replacement.quantity,
                      status: t(`subs.track.status.${c.replacement.status}`),
                    })
                  : t('subs.order.notCharged')}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">{t('subs.order.changedOnTracking')}</p>
        </div>
      )}
      <h3 className="mt-6 font-display text-xl font-bold">{t('account.tracking.inOrder')}</h3>
      <ul className="mt-3 divide-y divide-line">
        {order.items.map((item, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-4 py-2">
            <span className="min-w-0 break-words">
              {item.name} <span className="text-muted">({item.variantName})</span>
            </span>
            <span className="font-semibold">&times; {item.quantity}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
