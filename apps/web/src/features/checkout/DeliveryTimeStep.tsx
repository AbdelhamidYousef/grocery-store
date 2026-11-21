import { formatSlotRange, type DeliverySlot, type ShippingQuote } from '@store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import type { WebCart } from '../../api/cart';
import { ApiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useT, type TFunction } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { keys } from '../../lib/query-client';
import { TEST_IDS } from '../../lib/test-ids';
import { HoldCountdown } from '../delivery/HoldCountdown';
import {
  dayTabLabel,
  firstOpenSlot,
  useClearDelivery,
  useServerNow,
  useSetExpress,
  useSetSlot,
  useSlots,
} from '../delivery/slots';

// The message for a refused pick: what happened and what to do, in the shopper's words.
function pickError(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'SLOT_FULL':
        return t('delivery.error.slotFull');
      case 'SLOT_CLOSED':
        return t('delivery.error.slotClosed');
      case 'SLOT_WRONG_AREA':
        return t('delivery.error.wrongArea');
      case 'EXPRESS_UNAVAILABLE':
        return t('delivery.error.expressUnavailable');
    }
  }
  return t('delivery.slots.loadError');
}

// Step 2: when should the bag arrive. Express (when the store is open and has a rider free) and a
// slot picker: day tabs, hour buttons, full and closed ones disabled with their reason. Choosing
// calls the API at once (PUT /cart/slot holds the place for 15 minutes), so what the cart says is
// what the server holds; "Continue" only moves on when a live choice exists.
export function DeliveryTimeStep({
  cart,
  express: expressQuote,
  onContinue,
  placing,
}: {
  cart: WebCart;
  /** The express fee (null until the quotes load). */
  express: ShippingQuote | null;
  onContinue: () => void;
  placing: boolean;
}) {
  const { t, tn } = useT();
  const fmt = useFormat();
  const headingId = useId();
  const { data, isPending, error, refetch } = useSlots();
  const setSlot = useSetSlot();
  const setExpress = useSetExpress();
  const clear = useClearDelivery();
  const [dayIndex, setDayIndex] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  // The hold that ran out (the cart then has no delivery): say so until something is picked again.
  const [expiredHold, setExpiredHold] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const now = useServerNow(data?.offsetMs ?? 0);

  if (isPending && !error) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p className="sr-only" role="status">
          {t('delivery.slots.loading')}
        </p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div role="alert" data-testid={TEST_IDS.shippingError}>
        <p className="font-semibold text-danger">{t('delivery.slots.loadError')}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void refetch()}>
          {t('checkout.shipping.tryAgain')}
        </Button>
      </div>
    );
  }

  const days = data.days.filter((d) => d.slots.length > 0);
  const day = days[Math.min(dayIndex, Math.max(0, days.length - 1))];
  const slotIds = new Set(days.flatMap((d) => d.slots.map((s) => s.id)));
  // What the cart holds counts only if it is one of the slots offered for THIS postcode: a hold on
  // a slot of another store (the postcode changed) is not a choice here.
  const chosen = cart.delivery;
  const chosenSlotId =
    chosen?.kind === 'slot' && chosen.slot && slotIds.has(chosen.slot.id) ? chosen.slot.id : null;
  const chosenExpress = chosen?.kind === 'express';
  const busy = setSlot.isPending || setExpress.isPending || clear.isPending;

  const pick = (slot: DeliverySlot) => {
    setProblem(null);
    setSlot.mutate(slot.id, { onError: (e) => setProblem(pickError(e, t)) });
  };
  const pickExpress = () => {
    setProblem(null);
    setExpress.mutate(undefined, { onError: (e) => setProblem(pickError(e, t)) });
  };

  const expressReason = {
    closed: t('delivery.express.closed'),
    busy: t('delivery.express.busy'),
    no_postcode: t('delivery.express.noPostcode'),
  } as const;

  const canContinue = chosenExpress || chosenSlotId !== null;

  return (
    <div className="flex flex-col gap-5" aria-labelledby={headingId}>
      <div>
        <h3 id={headingId} className="font-display text-lg font-bold">
          {t('delivery.slots.title')}
        </h3>
        <p className="text-sm text-muted">{t('delivery.slots.lead')}</p>
      </div>

      {problem && (
        <p
          role="alert"
          data-testid={TEST_IDS.deliveryProblem}
          className="rounded-control border-2 border-danger bg-danger-soft p-3 font-semibold text-danger"
        >
          {problem}
        </p>
      )}
      {expiredHold && !chosen && (
        <p
          role="status"
          className="rounded-control border-2 border-line bg-dept-soft p-3 font-semibold"
        >
          {t('delivery.hold.expired')}
        </p>
      )}

      {data.express.available ? (
        <button
          type="button"
          data-testid={TEST_IDS.deliveryExpress}
          aria-pressed={chosenExpress}
          disabled={busy}
          onClick={pickExpress}
          className={cn(
            'flex min-h-14 items-start gap-3 rounded-control border-2 p-3 text-left',
            chosenExpress ? 'border-primary bg-primary-soft' : 'border-line',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('delivery.express.title')}</span>
            <span className="block text-sm text-muted">{t('delivery.express.lead')}</span>
          </span>
          {expressQuote && (
            <span className="shrink-0 font-display font-bold">
              {fmt.money(expressQuote.priceCents, expressQuote.currency)}
            </span>
          )}
        </button>
      ) : (
        data.express.reason && (
          <p data-testid={TEST_IDS.deliveryExpress} className="text-sm text-muted">
            {expressReason[data.express.reason]}
          </p>
        )
      )}

      {days.length === 0 ? (
        <p role="status" className="font-semibold">
          {t('delivery.slots.none')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            role="tablist"
            aria-label={t('delivery.slots.days')}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {days.map((d, i) => (
              <button
                key={d.date}
                type="button"
                role="tab"
                id={`${headingId}-tab-${d.date}`}
                aria-selected={d === day}
                aria-controls={`${headingId}-panel`}
                data-testid={TEST_IDS.deliveryDayTab}
                onClick={() => setDayIndex(i)}
                className={cn(
                  'min-h-11 shrink-0 rounded-control border-2 px-4 font-semibold',
                  d === day ? 'border-ink bg-ink text-surface' : 'border-line bg-surface',
                )}
              >
                {dayTabLabel(d.date, now, fmt.locale, t)}
              </button>
            ))}
          </div>
          {day && (
            <div
              id={`${headingId}-panel`}
              role="tabpanel"
              aria-labelledby={`${headingId}-tab-${day.date}`}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {day.slots.map((slot) => {
                const disabled = slot.status !== 'open';
                const selected = slot.id === chosenSlotId;
                const range = formatSlotRange(new Date(slot.startsAt), new Date(slot.endsAt));
                return (
                  <button
                    key={slot.id}
                    type="button"
                    data-testid={TEST_IDS.deliverySlot}
                    data-status={slot.status}
                    aria-pressed={selected}
                    disabled={disabled || busy}
                    onClick={() => pick(slot)}
                    className={cn(
                      'flex min-h-14 flex-col items-center justify-center rounded-control border-2 px-2 py-1',
                      selected ? 'border-primary bg-primary-soft' : 'border-line bg-surface',
                      disabled && 'cursor-not-allowed text-muted line-through opacity-60',
                    )}
                  >
                    <span className="font-semibold">{range}</span>
                    <span className="text-xs no-underline">
                      {selected
                        ? t('delivery.slots.yours')
                        : slot.status === 'full'
                          ? t('delivery.slots.full')
                          : slot.status === 'closed'
                            ? t('delivery.slots.closed')
                            : slot.remaining <= 3
                              ? tn('delivery.slots.left', slot.remaining)
                              : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {chosen?.kind === 'slot' && chosenSlotId && chosen.holdExpiresAt && (
        <HoldCountdown
          expiresAt={chosen.holdExpiresAt}
          offsetMs={data.offsetMs}
          onExpired={() => {
            setExpiredHold(chosen.holdExpiresAt);
            // The server stopped counting the hold by itself; the cart now says "no delivery".
            void queryClient.invalidateQueries({ queryKey: keys.cart });
            void queryClient.invalidateQueries({ queryKey: keys.slots });
          }}
        />
      )}

      {!firstOpenSlot(days) && !data.express.available && days.length > 0 && (
        <p role="status" className="text-sm text-muted">
          {t('delivery.slots.none')}
        </p>
      )}

      <Button
        size="lg"
        className="self-stretch sm:self-end"
        loading={placing}
        disabled={!canContinue || busy}
        onClick={onContinue}
        data-testid={TEST_IDS.checkoutContinuePayment}
      >
        {t('delivery.slots.continue')}
      </Button>
    </div>
  );
}
