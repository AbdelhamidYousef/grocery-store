import type { TrackedOrder } from '@store/shared';

import { TEST_IDS } from '../../lib/test-ids';

const WHEN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const formatWhen = (iso: string) => `${WHEN.format(new Date(iso))} UTC`;

export function TrackedOrderView({ order }: { order: TrackedOrder }) {
  return (
    <section
      aria-labelledby="tracked-heading"
      className="mt-8 rounded-card border-2 border-line bg-surface p-5 sm:p-6"
      data-testid={TEST_IDS.trackResult}
    >
      <h2 id="tracked-heading" className="font-display text-2xl font-bold">
        <span className="break-all">Order {order.orderNumber}</span>
      </h2>
      <p className="mt-1 text-lg">
        Status: <strong data-testid={TEST_IDS.trackStatus}>{order.statusLabel}</strong>
      </p>
      {order.tracking && (
        <p className="mt-1 text-muted">
          {order.tracking.carrier} tracking number:{' '}
          <span className="font-semibold text-ink">{order.tracking.trackingNumber}</span>
        </p>
      )}

      <h3 className="mt-6 font-display text-xl font-bold">Progress</h3>
      <ol
        aria-label="Order progress"
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
            <p className="font-semibold">{step.label}</p>
            <p className="text-sm text-muted">{formatWhen(step.at)}</p>
          </li>
        ))}
      </ol>

      <h3 className="mt-6 font-display text-xl font-bold">In this order</h3>
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
