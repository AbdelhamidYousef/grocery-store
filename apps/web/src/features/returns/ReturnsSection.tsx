import {
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  formatMoney,
  type CustomerReturn,
  type OrderItem,
} from '@store/shared';
import { useState } from 'react';

import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { formatDate } from '../../lib/format';
import { TEST_IDS } from '../../lib/test-ids';

import { useOrderReturns } from './queries';
import { ReturnRequestForm } from './ReturnRequestForm';

const TONE: Record<CustomerReturn['status'], BadgeTone> = {
  requested: 'neutral',
  approved: 'primary',
  rejected: 'danger',
  received: 'primary',
  refunded: 'success',
};

// Steps of one return, as they happened. A rejected return ends at "declined"; the others walk on.
function steps(r: CustomerReturn): { label: string; at: string }[] {
  const out = [{ label: 'Request sent', at: r.createdAt }];
  if (r.status === 'rejected') out.push({ label: RETURN_STATUS_LABELS.rejected, at: r.createdAt });
  if (r.approvedAt) out.push({ label: RETURN_STATUS_LABELS.approved, at: r.approvedAt });
  if (r.receivedAt) out.push({ label: RETURN_STATUS_LABELS.received, at: r.receivedAt });
  if (r.refundedAt) out.push({ label: RETURN_STATUS_LABELS.refunded, at: r.refundedAt });
  return out;
}

// "Return items" and the status timeline of each return, on the order page. Shown only for orders
// that can have returns; the server decides whether a new one is allowed and says why not.
export function ReturnsSection({
  orderNumber,
  currency,
  items,
  status,
}: {
  orderNumber: string;
  currency: string;
  items: OrderItem[];
  status: string;
}) {
  const relevant = status === 'delivered' || status === 'refunded';
  const { data, isPending, isError } = useOrderReturns(orderNumber, relevant);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  if (!relevant) return null;
  if (isPending && !isError) return null;
  if (isError || !data) return null;

  const { returns, eligibility } = data;
  if (returns.length === 0 && !eligibility.eligible && status === 'refunded') return null;

  return (
    <section
      aria-labelledby="returns-heading"
      data-testid={TEST_IDS.returnsSection}
      className="mt-8 flex flex-col gap-4"
    >
      <h3 id="returns-heading" className="font-display text-xl font-bold">
        Returns
      </h3>

      {open && eligibility.eligible ? (
        <ReturnRequestForm
          orderNumber={orderNumber}
          currency={currency}
          items={items}
          eligibility={eligibility}
          onCancel={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            toast.show('Return request sent. We will email you.', 'success');
          }}
        />
      ) : eligibility.eligible ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setOpen(true)}>Return items</Button>
          {eligibility.deadline && (
            <p className="text-sm text-muted">
              You can return items until {formatDate(eligibility.deadline)}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted" data-testid="return-ineligible">
          {eligibility.reason}
        </p>
      )}

      {returns.map((r) => (
        <article
          key={r.id}
          data-testid={TEST_IDS.returnCard}
          data-status={r.status}
          className="flex flex-col gap-2 rounded-card border border-line p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={TONE[r.status]}>{RETURN_STATUS_LABELS[r.status]}</Badge>
            <span className="text-sm text-muted">
              Asked {formatDate(r.createdAt)} · {RETURN_REASON_LABELS[r.reason]}
            </span>
          </div>
          <ul className="list-inside list-disc">
            {r.items.map((i) => (
              <li key={i.id} className="break-words">
                {i.quantity} × {i.productName} ({i.variantName})
              </li>
            ))}
          </ul>
          {r.rejectReason && (
            <p>
              <strong>Why we declined:</strong> {r.rejectReason}
            </p>
          )}
          <p>
            {r.status === 'refunded'
              ? `Refunded ${formatMoney(r.refundCents, currency)}${r.simulated ? ' (demo: simulated, no money moved)' : ''}`
              : r.status === 'rejected'
                ? 'No refund for this request.'
                : `Expected refund ${formatMoney(r.refundCents, currency)}`}
          </p>
          <ol
            aria-label="Return progress"
            data-testid={TEST_IDS.returnTimeline}
            className="flex flex-col gap-1 border-l-2 border-line pl-4 text-sm"
          >
            {steps(r).map((s) => (
              <li key={s.label}>
                <strong>{s.label}</strong> · {formatDate(s.at, true)}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </section>
  );
}
