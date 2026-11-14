import { formatMoney, pointsToCents } from '@store/shared';
import { useId, useState } from 'react';

import { Button } from '../../components/ui/Button';
import { TEST_IDS } from '../../lib/test-ids';

import { usePoints } from './queries';

// Checkout: pay part of the merchandise with points. The shopper types a number (or taps "use
// max"); the server re-checks the balance under a lock and caps it at the merchandise left, so
// this control only proposes. It shows nothing for a guest or a balance of zero.
export function PointsRedeem({
  merchandiseCents,
  currency,
  value,
  onChange,
  problem,
}: {
  merchandiseCents: number;
  currency: string;
  value: number;
  onChange: (points: number) => void;
  problem?: string | null;
}) {
  const id = useId();
  const { data } = usePoints();
  const [text, setText] = useState(value > 0 ? String(value) : '');
  if (!data || data.balance <= 0) return null;
  const max = Math.min(data.balance, merchandiseCents);
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
        Use loyalty points
      </label>
      <p className="text-sm text-muted">
        You have {data.balance} points (worth {formatMoney(pointsToCents(data.balance), currency)}).
        100 points = {formatMoney(100, currency)} off your items.
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
          Use max ({max})
        </Button>
        {value > 0 && (
          <Button type="button" variant="ghost" onClick={() => commit('')}>
            Clear
          </Button>
        )}
      </div>
      {value > 0 && (
        <p className="mt-2 text-sm font-semibold text-success" data-testid={TEST_IDS.pointsApplied}>
          {value} points = {formatMoney(pointsToCents(value), currency)} off
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
