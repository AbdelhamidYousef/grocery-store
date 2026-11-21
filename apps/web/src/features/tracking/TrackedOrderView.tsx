import type { TrackedOrder } from '@store/shared';
import { useMemo } from 'react';

import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';
import { deliverySentence } from '../delivery/slots';

export function TrackedOrderView({ order }: { order: TrackedOrder }) {
  const { t } = useT();
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
