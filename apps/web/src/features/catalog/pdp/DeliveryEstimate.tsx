import {
  defaultDeliveryRules,
  estimateDelivery,
  formatCountdown,
  formatDeliveryDay,
  type DeliveryEstimate as Estimate,
  type DeliveryMethod,
} from '@store/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchDeliveryMethods } from '../../../api/delivery';
import { keys } from '../../../lib/query-client';
import { TEST_IDS } from '../../../lib/test-ids';

// The clock ticks once a minute: a second-by-second countdown on a product page is noise.
const TICK_MS = 60_000;

const range = (from: string, to: string) =>
  from === to ? formatDeliveryDay(from) : `${formatDeliveryDay(from)} to ${formatDeliveryDay(to)}`;

// The two texts the block shows, from pure data so they can be tested without a clock.
//  - `visible`: the ticking sentence ("Order in 3h 20m, arrives Mon 9 Nov to Wed 11 Nov");
//  - `spoken`: a STATIC sentence for screen readers, with no countdown in it, so nothing is
//    announced every minute. It changes only when a date does.
export function describeEstimates(
  estimates: { method: DeliveryMethod; estimate: Estimate }[],
): { visible: string[]; spoken: string } | null {
  const [first] = estimates;
  if (!first) return null;
  const { estimate } = first;
  const lead = estimate.dispatchesToday
    ? `Order in ${formatCountdown(estimate.msToCutoff ?? 0)}, arrives ${range(estimate.arrivesFrom, estimate.arrivesTo)}`
    : `Order now, ships ${formatDeliveryDay(estimate.dispatchDate)}, arrives ${range(estimate.arrivesFrom, estimate.arrivesTo)}`;
  const others = estimates
    .slice(1)
    .map((e) => `${e.method.name} arrives ${range(e.estimate.arrivesFrom, e.estimate.arrivesTo)}`);
  const spoken =
    `${estimate.cutoffLabel.replace('Cutoff', 'Order before')} on a business day and it ships the same day. ` +
    estimates
      .map(
        (e) => `${e.method.name} arrives ${range(e.estimate.arrivesFrom, e.estimate.arrivesTo)}.`,
      )
      .join(' ');
  return { visible: [lead, ...others], spoken };
}

// The methods to show: the cheapest-and-slowest one first (what most people pick), then the
// fastest if it is a different method. The API sends them fastest first.
export function pickMethods(methods: readonly DeliveryMethod[]): DeliveryMethod[] {
  const standard = methods.find((m) => m.code === 'standard') ?? methods[methods.length - 1];
  const fastest = methods[0];
  return [standard, fastest && fastest.code !== standard?.code ? fastest : undefined].flatMap(
    (m) => (m ? [m] : []),
  );
}

export function DeliveryEstimate() {
  const { data } = useQuery({
    queryKey: keys.deliveryMethods,
    queryFn: ({ signal }) => fetchDeliveryMethods(signal),
    staleTime: 5 * 60_000,
  });
  // The device clock is sampled once a minute (and when the component mounts); the server offset
  // is added at render time, so a fresh offset applies at once.
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setDeviceNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  if (!data || data.methods.length === 0) return null;
  const now = new Date(deviceNow + data.offsetMs);
  const estimates = pickMethods(data.methods).map((method) => ({
    method,
    estimate: estimateDelivery(now, defaultDeliveryRules(method.etaDaysMin, method.etaDaysMax)),
  }));
  const text = describeEstimates(estimates);
  const cutoff = estimates[0]?.estimate.cutoffLabel;
  if (!text) return null;

  return (
    <div
      data-testid={TEST_IDS.deliveryEstimate}
      aria-live="off"
      className="flex flex-col gap-0.5 rounded-card bg-pet-soft p-3"
    >
      <p aria-hidden="true" className="font-semibold">
        {text.visible[0]}
      </p>
      {text.visible.slice(1).map((line) => (
        <p key={line} aria-hidden="true" className="text-sm">
          {line}
        </p>
      ))}
      <p aria-hidden="true" className="text-sm text-muted">
        {cutoff}, Amsterdam time, Monday to Friday.
      </p>
      <p className="sr-only">{text.spoken}</p>
    </div>
  );
}
