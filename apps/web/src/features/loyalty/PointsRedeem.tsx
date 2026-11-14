import { MIN_CHARGE_CENTS, pointsToCents } from '@store/shared';
import { useId, useState } from 'react';

import { Button } from '../../components/ui/Button';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';

import { usePoints } from './queries';

// Checkout: pay part of the merchandise with points. The shopper types a number (or taps "use
// max"); the server re-checks the balance under a lock and caps it at the merchandise left, so
// this control only proposes. It shows nothing for a guest or a balance of zero.
export function PointsRedeem({
  merchandiseCents,
  shippingCents = 0,
  currency,
  value,
  onChange,
  problem,
}: {
  merchandiseCents: number;
  /** Delivery cost of the chosen method; it counts towards the card minimum. */
  shippingCents?: number;
  currency: string;
  value: number;
  onChange: (points: number) => void;
  problem?: string | null;
}) {
  const id = useId();
  const { t } = useT();
  const fmt = useFormat();
  const { data } = usePoints();
  const [text, setText] = useState(value > 0 ? String(value) : '');
  if (!data || data.balance <= 0) return null;
  // The engine keeps the payable total (items + delivery) at or above the card minimum, so the
  // box offers no more than that either; the server's answer still decides.
  const max = Math.min(
    data.balance,
    merchandiseCents,
    Math.max(0, merchandiseCents + shippingCents - MIN_CHARGE_CENTS),
  );
  const commit = (raw: string) => {
    setText(raw);
    const n = Number.parseInt(raw, 10);
    onChange(Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0);
  };
  return (
    <div
      data-testid={TEST_IDS.pointsRedeem}
      className="mb-4 rounded-card border-2 border-line bg-pet-soft p-4"
    >
      <label htmlFor={id} className="font-display font-bold">
        {t('loyalty.redeem.title')}
      </label>
      <p className="text-sm text-muted">
        {t('loyalty.redeem.balance', {
          balance: data.balance,
          worth: fmt.money(pointsToCents(data.balance), currency),
        })}{' '}
        {t('loyalty.redeem.rate', { amount: fmt.money(100, currency) })}{' '}
        {t('loyalty.redeem.minimum', { amount: fmt.money(MIN_CHARGE_CENTS, currency) })}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={text}
          onChange={(e) => commit(e.target.value)}
          aria-describedby={problem ? `${id}-problem` : undefined}
          aria-invalid={problem ? true : undefined}
          className="min-h-11 w-32 rounded-control border-2 border-line bg-surface px-3"
        />
        <Button type="button" variant="secondary" onClick={() => commit(String(max))}>
          {t('loyalty.redeem.useMax', { max })}
        </Button>
        {value > 0 && (
          <Button type="button" variant="ghost" onClick={() => commit('')}>
            {t('loyalty.redeem.clear')}
          </Button>
        )}
      </div>
      {value > 0 && (
        <p className="mt-2 text-sm font-semibold text-success" data-testid={TEST_IDS.pointsApplied}>
          {t('loyalty.redeem.applied', {
            points: value,
            amount: fmt.money(pointsToCents(value), currency),
          })}
        </p>
      )}
      {problem && (
        <p id={`${id}-problem`} role="alert" className="mt-2 text-sm font-semibold text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
