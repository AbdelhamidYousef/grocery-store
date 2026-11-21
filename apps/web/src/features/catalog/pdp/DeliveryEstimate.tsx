import {
  defaultDeliveryRules,
  estimateDelivery,
  formatDeliveryDay,
  type DeliveryEstimate as Estimate,
  type DeliveryMethod,
} from '@store/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchDeliveryMethods } from '../../../api/delivery';
import { lookupFor, useT, type TFunction } from '../../../i18n';
import { useFormat } from '../../../i18n/format';
import { keys } from '../../../lib/query-client';
import { TEST_IDS } from '../../../lib/test-ids';

// The clock ticks once a minute: a second-by-second countdown on a product page is noise.
const TICK_MS = 60_000;

// What the pure helpers need to speak: a translate function and the locale for the day names.
// Without it they speak the default English, which keeps them callable from tests.
export interface Speech {
  t: TFunction;
  locale: string;
}
const ENGLISH: Speech = { t: (key, params) => lookupFor('en-IE').t(key, params), locale: 'en-IE' };

// "Tue 4 Nov". English keeps the shared writer (the same text in every browser); other languages
// use Intl on the calendar date, pinned to UTC noon so the day never shifts with the time zone.
function dayLabel(key: string, locale: string): string {
  if (locale.startsWith('en')) return formatDeliveryDay(key);
  const date = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return formatDeliveryDay(key);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

const range = (from: string, to: string, { t, locale }: Speech) =>
  from === to
    ? dayLabel(from, locale)
    : t('pdp.estimate.range', { from: dayLabel(from, locale), to: dayLabel(to, locale) });

// "3h 20m", "45m", "under a minute": the shared helper's rule (round DOWN), in the shopper's words.
function countdown(ms: number, t: TFunction): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return t('pdp.estimate.countdownUnderMinute');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('pdp.estimate.countdownHm', { h, m }) : t('pdp.estimate.countdownM', { m });
}

// The shared estimate's label is "Cutoff 15:00 CET"; the part after the word is the time and the zone.
const cutoffTime = (label: string) => label.replace(/^Cutoff\s+/, '');

// The two texts the block shows, from pure data so they can be tested without a clock.
//  - `visible`: the ticking sentence ("Order in 3h 20m, arrives Mon 9 Nov to Wed 11 Nov");
//  - `spoken`: a STATIC sentence for screen readers, with no countdown in it, so nothing is
//    announced every minute. It changes only when a date does.
export function describeEstimates(
  estimates: { method: DeliveryMethod; estimate: Estimate }[],
  speech: Speech = ENGLISH,
): { visible: string[]; spoken: string } | null {
  const [first] = estimates;
  if (!first) return null;
  const { estimate } = first;
  const { t, locale } = speech;
  const arrives = range(estimate.arrivesFrom, estimate.arrivesTo, speech);
  const lead = estimate.dispatchesToday
    ? t('pdp.estimate.orderIn', {
        countdown: countdown(estimate.msToCutoff ?? 0, t),
        range: arrives,
      })
    : t('pdp.estimate.orderNow', {
        day: dayLabel(estimate.dispatchDate, locale),
        range: arrives,
      });
  const others = estimates.slice(1).map((e) =>
    t('pdp.estimate.methodArrives', {
      method: e.method.name,
      range: range(e.estimate.arrivesFrom, e.estimate.arrivesTo, speech),
    }),
  );
  const spoken =
    `${t('pdp.estimate.spoken', { time: cutoffTime(estimate.cutoffLabel) })} ` +
    estimates
      .map((e) =>
        t('pdp.estimate.methodArrivesSpoken', {
          method: e.method.name,
          range: range(e.estimate.arrivesFrom, e.estimate.arrivesTo, speech),
        }),
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
  const { t } = useT();
  const { locale } = useFormat();
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
  const text = describeEstimates(estimates, { t, locale });
  const cutoff = estimates[0]?.estimate.cutoffLabel;
  if (!text) return null;

  return (
    <div
      data-testid={TEST_IDS.deliveryEstimate}
      aria-live="off"
      className="flex flex-col gap-0.5 rounded-card bg-dept-soft p-3"
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
        {t('pdp.estimate.cutoffNote', { time: cutoff ? cutoffTime(cutoff) : '' })}
      </p>
      <p className="sr-only">{text.spoken}</p>
    </div>
  );
}
