import type { CustomerReturn, OrderItem } from '@store/shared';
import { useState } from 'react';

import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useT, type TFunction } from '../../i18n';
import { useFormat } from '../../i18n/format';
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
function steps(r: CustomerReturn, t: TFunction): { label: string; at: string }[] {
  const out = [{ label: t('returns.step.sent'), at: r.createdAt }];
  if (r.status === 'rejected') out.push({ label: t('returns.status.rejected'), at: r.createdAt });
  if (r.approvedAt) out.push({ label: t('returns.status.approved'), at: r.approvedAt });
  if (r.receivedAt) out.push({ label: t('returns.status.received'), at: r.receivedAt });
  if (r.refundedAt) out.push({ label: t('returns.status.refunded'), at: r.refundedAt });
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
  // The API's "why not" is English text; the window one carries a number, so it is matched here.
  const reasonText = (reason: string) => {
    const closed = /^The (\d+)-day return window has closed$/.exec(reason);
    return closed ? t('returns.windowClosed', { days: closed[1] ?? '' }) : tm(reason);
  };
  const relevant = status === 'delivered' || status === 'refunded';
  const { data, isPending, isError } = useOrderReturns(orderNumber, relevant);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const { t, tm } = useT();
  const fmt = useFormat();
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
        {t('returns.title')}
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
            toast.show(t('returns.sent'), 'success');
          }}
        />
      ) : eligibility.eligible ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setOpen(true)}>{t('returns.returnItems')}</Button>
          {eligibility.deadline && (
            <p className="text-sm text-muted">
              {t('returns.returnUntil', { date: fmt.date(eligibility.deadline) })}
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted" data-testid="return-ineligible">
          {eligibility.reason && reasonText(eligibility.reason)}
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
            <Badge tone={TONE[r.status]}>{t(`returns.status.${r.status}`)}</Badge>
            <span className="text-sm text-muted">
              {t('returns.asked', {
                date: fmt.date(r.createdAt),
                reason: t(`returns.reason.${r.reason}`),
              })}
            </span>
          </div>
          <ul className="list-inside list-disc">
            {r.items.map((i) => (
              <li key={i.id} className="break-words">
                {t('returns.lineItem', {
                  quantity: i.quantity,
                  product: i.productName,
                  variant: i.variantName,
                })}
              </li>
            ))}
          </ul>
          {r.rejectReason && (
            <p>
              <strong>{t('returns.whyDeclined')}</strong> {r.rejectReason}
            </p>
          )}
          <p>
            {r.status === 'refunded'
              ? t(r.simulated ? 'returns.refundedSimulated' : 'returns.refunded', {
                  amount: fmt.money(r.refundCents, currency),
                })
              : r.status === 'rejected'
                ? t('returns.noRefund')
                : t('returns.expectedRefund', { amount: fmt.money(r.refundCents, currency) })}
          </p>
          <ol
            aria-label={t('returns.progress')}
            data-testid={TEST_IDS.returnTimeline}
            className="flex flex-col gap-1 border-l-2 border-line pl-4 text-sm"
          >
            {steps(r, t).map((s) => (
              <li key={s.label}>
                <strong>{s.label}</strong> · {fmt.date(s.at, true)}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </section>
  );
}
