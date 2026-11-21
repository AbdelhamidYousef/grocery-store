import { useEffect, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

// "Held for 14:32": the minutes and seconds left on the slot hold. Counts down once a second against
// the server's clock (`offsetMs`), and tells the page once when it reaches zero so the cart is
// refetched (the server stopped counting the hold at that moment, on its own).
export function HoldCountdown({
  expiresAt,
  offsetMs,
  onExpired,
}: {
  expiresAt: string;
  offsetMs: number;
  onExpired: () => void;
}) {
  const { t } = useT();
  const target = Date.parse(expiresAt);
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => window.clearInterval(id);
  }, [offsetMs]);

  const left = Math.max(0, target - now);
  const told = useRef(false);
  useEffect(() => {
    // Once: the parent's reaction (a refetch) must not be triggered again by every render.
    if (left === 0 && !told.current) {
      told.current = true;
      onExpired();
    }
  }, [left, onExpired]);

  const total = Math.ceil(left / 1000);
  const time = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return (
    <p data-testid={TEST_IDS.deliveryHold} className="text-sm font-semibold">
      {/* Not announced every second: the label is static for screen readers. */}
      <span aria-hidden="true">{t('delivery.hold.label', { time })}</span>
      <span className="sr-only">{t('delivery.hold.aria', { minutes: Math.ceil(total / 60) })}</span>
    </p>
  );
}
