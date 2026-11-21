import { formatMoney, type AdminOrderDetail } from '@store/shared';
import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { TEST_IDS } from '../../lib/test-ids';
import { FormAlert } from '../auth/AuthCard';

import { adminErrorMessage } from './errors';
import { useCaptureAdminOrder } from './queries';

const CAPTURABLE = ['paid', 'processing', 'shipped', 'delivered'];

// "Capture now": takes the money of an authorised order (picking will do it in a later phase). For
// weighed lines the packed grams can be typed; a line left empty is charged at its estimate. The
// amount itself is worked out by the server from the order, so this page cannot ask for more.
export function OrderCapture({ detail }: { detail: AdminOrderDetail }) {
  const { order, payment } = detail;
  const toast = useToast();
  const mutation = useCaptureAdminOrder(order.number);
  const [grams, setGrams] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (
    payment?.status !== 'authorized' ||
    order.capturedCents !== null ||
    !CAPTURABLE.includes(order.status)
  ) {
    return null;
  }
  const weighed = order.items.filter((i) => i.pricePerKgCents !== null && i.weighedGrams === null);
  const authorized = order.authorizedCents ?? order.totals.totalCents;
  const entries = weighed.flatMap((i) => {
    const n = Number(grams[i.id]);
    return Number.isInteger(n) && n > 0 ? [{ orderItemId: i.id, grams: n }] : [];
  });
  const invalid = weighed.some((i) => {
    const raw = (grams[i.id] ?? '').trim();
    return raw !== '' && !(Number.isInteger(Number(raw)) && Number(raw) > 0);
  });

  const run = () => {
    setError(null);
    mutation.mutate(entries.length > 0 ? { weights: entries } : {}, {
      onSuccess: (d) => {
        toast.show(
          `Captured ${formatMoney(d.order.capturedCents ?? 0, d.order.totals.currency)}`,
          'success',
        );
      },
      onError: (e) => setError(adminErrorMessage(e)),
    });
  };

  return (
    <div
      data-testid={TEST_IDS.adminCapture}
      className="flex flex-col gap-3 rounded-card border-2 border-line p-4"
    >
      <h4 className="font-semibold">Capture the payment</h4>
      <p className="text-sm text-muted">
        {formatMoney(authorized, order.totals.currency)} is held on the card. Capturing takes the
        final amount: never more than the hold.
        {weighed.length > 0 &&
          ' Type what each weighed line weighed; a line left empty is charged at its estimate.'}
      </p>
      <FormAlert message={error} />
      {weighed.map((item) => (
        <Input
          key={item.id}
          label={`${item.productName}: grams packed`}
          hint={`Estimate ${formatMoney(item.lineTotalCents, order.totals.currency)} for ${item.quantity} unit${item.quantity === 1 ? '' : 's'}`}
          inputMode="numeric"
          value={grams[item.id] ?? ''}
          onChange={(e) => setGrams({ ...grams, [item.id]: e.target.value })}
        />
      ))}
      <div>
        <Button
          data-testid={TEST_IDS.adminCaptureNow}
          loading={mutation.isPending}
          disabled={invalid}
          onClick={run}
        >
          Capture now
        </Button>
      </div>
    </div>
  );
}
