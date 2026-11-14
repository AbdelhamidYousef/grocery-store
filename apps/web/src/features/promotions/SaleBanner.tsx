import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { fetchSaleBanner } from '../../api/promotions';
import { CloseIcon } from '../../components/icons';
import { useT } from '../../i18n';
import { keys } from '../../lib/query-client';
import { TEST_IDS } from '../../lib/test-ids';

import { formatCountdown, readDismissed, rememberDismissed } from './countdown';

// How often the banner asks again on its own: a sale can be created, moved or ended by an admin.
const REFRESH_MS = 5 * 60_000;

// Remaining time against the SERVER's clock: device time plus the offset measured when the banner
// arrived. Ticks once a second; the ticking text is aria-live="off", so a screen reader is not
// interrupted every second (it reads the current value when the user reaches it).
function useRemaining(targetIso: string, offsetMs: number): number {
  // The device clock is sampled once a second. The server offset is added at render time, so a
  // fresh offset applies at once; the sample is at most a second old, which can only make the
  // remaining time look slightly longer, never expire a sale early.
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setDeviceNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Date.parse(targetIso) - (deviceNow + offsetMs);
}

// A strip above the header, only while a sale is running or about to start. It has a fixed height
// and one line (a long name is cut with an ellipsis, the countdown never is), so its appearance
// pushes the page by a known amount once and never changes size while it ticks.
export function SaleBanner() {
  const { t } = useT();
  const { data, refetch } = useQuery({
    queryKey: keys.saleBanner,
    queryFn: ({ signal }) => fetchSaleBanner(signal),
    staleTime: 60_000,
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const sale = data?.sale ?? null;
  const remaining = useRemaining(
    sale?.status === 'scheduled' ? sale.startsAt : (sale?.endsAt ?? ''),
    data?.offsetMs ?? 0,
  );

  // When the countdown reaches zero the status has changed (a scheduled sale started, a running
  // one ended): ask once for the new truth instead of showing 0s or a stale banner.
  const asked = useRef('');
  const expired = sale !== null && remaining <= 0;
  const stamp = sale ? `${sale.id}:${sale.status}` : '';
  useEffect(() => {
    if (expired && asked.current !== stamp) {
      asked.current = stamp;
      void refetch();
    }
  }, [expired, stamp, refetch]);

  if (!sale || expired || dismissed.includes(sale.id)) return null;

  const dismiss = () => {
    rememberDismissed(sale.id);
    setDismissed((d) => [...d, sale.id]);
  };

  return (
    <div
      role="region"
      aria-label={t('shell.sale.label')}
      data-testid={TEST_IDS.saleBanner}
      className="flex h-11 items-center justify-center gap-2 border-b-2 border-ink bg-primary-soft px-2 text-sm text-primary-strong"
    >
      <p className="flex min-w-0 items-baseline justify-center font-semibold">
        <span className="truncate font-display font-bold">{sale.name}&nbsp;</span>
        <span className="shrink-0">
          {sale.status === 'active' ? t('shell.sale.endsIn') : t('shell.sale.startsIn')}{' '}
          <span aria-live="off" data-testid={TEST_IDS.saleBannerCountdown} className="tabular-nums">
            {formatCountdown(remaining, t)}
          </span>
        </span>
      </p>
      <button
        type="button"
        data-testid={TEST_IDS.saleBannerDismiss}
        onClick={dismiss}
        aria-label={t('shell.sale.dismiss', { name: sale.name })}
        className="-my-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-primary-soft"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
