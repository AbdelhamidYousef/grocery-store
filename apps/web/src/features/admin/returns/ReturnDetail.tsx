import {
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  formatMoney,
  type AdminReturnDetail,
} from '@store/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError } from '../../../api/client';
import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { formatDate } from '../../../lib/format';
import { TEST_IDS } from '../../../lib/test-ids';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { useAdminReturn, useReturnAction } from './queries';
import { RETURN_TONE } from './tone';

// One return with exactly the buttons its state allows (`allowedNext` from the API), so the
// server's 409 is a safety net for two admins at once, not something a person can click into.
export function ReturnDetail() {
  const { id = '' } = useParams();
  const { data, isPending, error, refetch } = useAdminReturn(id);

  const back = (
    <Link to="/admin/returns" className="font-semibold text-primary-strong underline">
      Back to returns
    </Link>
  );
  if (isPending && !error) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <section>
        <h2 className="font-display text-xl font-bold">
          {missing ? "We can't find that return" : 'We could not load this return'}
        </h2>
        <div className="mt-3 flex flex-wrap gap-4">
          {!missing && (
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          )}
          {back}
        </div>
      </section>
    );
  }
  return <Ready detail={data} back={back} />;
}

function Ready({ detail, back }: { detail: AdminReturnDetail; back: React.ReactNode }) {
  const r = detail.return;
  const act = useReturnAction(r.id);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [refundShipping, setRefundShipping] = useState(false);
  const [restock, setRestock] = useState<Set<string>>(new Set(detail.restockItemIds));

  const run = (input: Parameters<typeof act.mutate>[0], done: string) => {
    setError(null);
    act.mutate(input, {
      onSuccess: () => {
        setRejecting(false);
        toast.show(done, 'success');
      },
      onError: (e) => setError(adminErrorMessage(e)),
    });
  };
  const can = (s: AdminReturnDetail['allowedNext'][number]) => detail.allowedNext.includes(s);
  const shippingText = formatMoney(detail.shippingCents, detail.currency);

  return (
    <section
      aria-labelledby="return-heading"
      data-testid={TEST_IDS.adminReturnDetail}
      data-status={r.status}
      className="flex flex-col gap-4"
    >
      <Seo title={`Return ${r.orderNumber}`} noindex />
      <p>{back}</p>
      <h2
        id="return-heading"
        className="flex flex-wrap items-center gap-3 font-display text-xl font-bold"
      >
        <span>Return for order {r.orderNumber}</span>
        <Badge tone={RETURN_TONE[r.status]}>{RETURN_STATUS_LABELS[r.status]}</Badge>
        {r.simulated && <Badge tone="pet">Simulated refund</Badge>}
      </h2>
      <p className="text-muted">
        {detail.email} · asked {formatDate(r.createdAt, true)} · {RETURN_REASON_LABELS[r.reason]}
      </p>
      {r.note && <p className="whitespace-pre-line break-words">“{r.note}”</p>}
      {r.rejectReason && (
        <p>
          <strong>Declined:</strong> {r.rejectReason}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {r.items.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-line p-3"
          >
            {can('received') ? (
              <Checkbox
                label={`${i.quantity} × ${i.productName} (${i.variantName}) — put back on the shelf`}
                checked={restock.has(i.id)}
                disabled={i.reason === 'damaged'}
                onChange={(e) => {
                  const next = new Set(restock);
                  if (e.target.checked) next.add(i.id);
                  else next.delete(i.id);
                  setRestock(next);
                }}
              />
            ) : (
              <span className="min-w-0 break-words">
                {i.quantity} × {i.productName} ({i.variantName})
              </span>
            )}
            <span className="text-sm text-muted">{RETURN_REASON_LABELS[i.reason]}</span>
            <span className="ml-auto font-semibold">
              {formatMoney(i.refundCents, detail.currency)}
            </span>
          </li>
        ))}
      </ul>
      {can('received') && (
        <p className="text-sm text-muted">Damaged lines never go back on the shelf.</p>
      )}

      <p className="font-semibold">
        Refund: {formatMoney(r.refundCents, detail.currency)}
        {r.refundShipping ? ' (shipping included)' : ''} of the order total{' '}
        {formatMoney(detail.orderTotalCents, detail.currency)}
      </p>

      <FormAlert message={error} />

      {can('refunded') && (
        <div className="flex flex-col gap-2">
          {detail.simulatedMode && (
            <p role="note" className="rounded-control bg-pet-soft p-2 text-sm">
              Demo mode: no payment provider is connected, so this refund will be recorded as
              simulated and no money moves.
            </p>
          )}
          {detail.shippingRefundable ? (
            <Checkbox
              label={`Also refund shipping (${shippingText})`}
              checked={refundShipping}
              onChange={(e) => setRefundShipping(e.target.checked)}
            />
          ) : (
            detail.shippingCents > 0 && (
              <p className="text-sm text-muted">
                Shipping was already refunded with another return.
              </p>
            )
          )}
        </div>
      )}

      {rejecting ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run({ action: 'reject', reason }, 'Return declined');
          }}
        >
          <Input
            label="Reason (the customer sees it)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" variant="danger" loading={act.isPending}>
            Confirm decline
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {can('approved') && (
            <Button
              loading={act.isPending}
              onClick={() => run({ action: 'approve' }, 'Return approved')}
            >
              Approve return
            </Button>
          )}
          {can('rejected') && (
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              Decline return
            </Button>
          )}
          {can('received') && (
            <Button
              loading={act.isPending}
              onClick={() =>
                run({ action: 'receive', restockItemIds: [...restock] }, 'Marked as received')
              }
            >
              Mark received
            </Button>
          )}
          {can('refunded') && (
            <Button
              loading={act.isPending}
              onClick={() => run({ action: 'refund', refundShipping }, 'Refund sent')}
            >
              Refund{' '}
              {formatMoney(
                r.refundCents + (refundShipping ? detail.shippingCents : 0),
                detail.currency,
              )}
            </Button>
          )}
          {detail.allowedNext.length === 0 && (
            <p className="text-muted">Nothing more to do for this return.</p>
          )}
        </div>
      )}
    </section>
  );
}
