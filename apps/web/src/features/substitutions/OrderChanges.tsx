import type { Order } from '@store/shared';

import { ApiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { image600 } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';

import { canAnswerSwaps, changesOf, replacementSavingCents, type OrderChange } from './changes';
import { useAnswerSwap } from './queries';

// "Changes to your order": what was missing or short when the bag was packed, the replacement for
// it with what the shopper saves, and the answer: accept or reject until the bag is closed, then
// the outcome. Missing items say plainly that they are not charged.
export function OrderChanges({ order }: { order: Order }) {
  const { t } = useT();
  const changes = changesOf(order.items);
  if (changes.length === 0) return null;
  const answerable = canAnswerSwaps(order);
  return (
    <section
      aria-labelledby="order-changes-heading"
      data-testid={TEST_IDS.orderChanges}
      className="rounded-card border-2 border-primary bg-primary-soft p-4 sm:p-5"
    >
      <h3 id="order-changes-heading" className="font-display text-xl font-bold">
        {t('subs.order.heading')}
      </h3>
      <p className="mt-1 text-sm">{t('subs.order.intro')}</p>
      <ul className="mt-4 flex flex-col gap-4">
        {changes.map((c) => (
          <ChangeCard key={c.original.id} change={c} order={order} answerable={answerable} />
        ))}
      </ul>
    </section>
  );
}

function ChangeCard({
  change,
  order,
  answerable,
}: {
  change: OrderChange;
  order: Order;
  answerable: boolean;
}) {
  const { t } = useT();
  const fmt = useFormat();
  const toast = useToast();
  const answer = useAnswerSwap(order.number);
  const { original, replacement } = change;
  const currency = order.totals.currency;
  const picked = original.pickedQty ?? 0;
  const saving = replacementSavingCents(change);
  const send = (decision: 'accept' | 'reject') => {
    if (!replacement) return;
    answer.mutate(
      { itemId: replacement.id, decision },
      {
        onError: (error) =>
          toast.show(
            error instanceof ApiError && error.status === 409
              ? t('subs.order.answerClosed')
              : t('subs.order.answerError'),
            'error',
          ),
      },
    );
  };

  return (
    <li data-testid={TEST_IDS.orderChange} className="rounded-control bg-surface p-3">
      <p className="break-words font-semibold">{original.productName}</p>
      <p className="text-sm" data-testid={TEST_IDS.orderChangeGap}>
        {picked === 0
          ? t('subs.order.missing')
          : t('subs.order.short', { picked, quantity: original.quantity })}
      </p>
      {replacement ? (
        <div className="mt-3 flex items-start gap-3 border-t border-line pt-3">
          {replacement.imageUrl ? (
            <img
              src={image600(replacement.imageUrl)}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-control border border-line object-cover"
            />
          ) : (
            <span aria-hidden="true" className="h-16 w-16 shrink-0 rounded-control bg-line" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{t('subs.order.instead')}</p>
            <p className="break-words font-semibold">{replacement.productName}</p>
            <p className="break-words text-sm text-muted">
              {replacement.variantName} ·{' '}
              {t('subs.order.priceEach', {
                quantity: replacement.quantity,
                price: fmt.money(replacement.unitPriceCents, currency),
              })}
            </p>
            {saving > 0 && (
              <p
                data-testid={TEST_IDS.orderChangeSave}
                className="text-sm font-semibold text-primary-strong"
              >
                {t('subs.order.save', { amount: fmt.money(saving, currency) })}
              </p>
            )}
            <SwapState
              swap={replacement}
              answerable={answerable}
              captured={order.capturedCents !== null}
              pending={answer.isPending}
              currency={currency}
              onAnswer={send}
            />
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm font-semibold text-primary-strong">
          {t('subs.order.notCharged')}
        </p>
      )}
    </li>
  );
}

function SwapState({
  swap,
  answerable,
  captured,
  pending,
  currency,
  onAnswer,
}: {
  swap: Order['items'][number];
  answerable: boolean;
  captured: boolean;
  pending: boolean;
  currency: string;
  onAnswer: (decision: 'accept' | 'reject') => void;
}) {
  const { t } = useT();
  const fmt = useFormat();
  if (swap.swapStatus === 'rejected') {
    return (
      <p data-testid={TEST_IDS.orderChangeState} className="mt-1 text-sm font-semibold">
        {swap.refundedCents > 0
          ? t('subs.order.refused', { amount: fmt.money(swap.refundedCents, currency) })
          : t('subs.order.rejected')}
      </p>
    );
  }
  if (swap.swapStatus === 'accepted') {
    return (
      <p data-testid={TEST_IDS.orderChangeState} className="mt-1 text-sm font-semibold">
        {t('subs.order.accepted')}{' '}
        {captured && <span className="font-normal text-muted">{t('subs.order.atDoor')}</span>}
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      {answerable && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            data-testid={TEST_IDS.swapAccept}
            onClick={() => onAnswer('accept')}
          >
            {t('subs.order.accept')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            data-testid={TEST_IDS.swapReject}
            onClick={() => onAnswer('reject')}
          >
            {t('subs.order.reject')}
          </Button>
        </div>
      )}
      <p className="text-sm text-muted">{t('subs.order.unanswered')}</p>
    </div>
  );
}
