import { useId } from 'react';
import { Link } from 'react-router-dom';

import type { WebCart } from '../../api/cart';
import { buttonClasses, Button } from '../../components/ui/Button';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { freeShippingProgress } from '../../lib/shipping';
import { TEST_IDS } from '../../lib/test-ids';
import { useFreeShippingThreshold } from '../checkout/queries';
import { NextDelivery } from '../delivery/NextDelivery';
import { EarnPoints } from '../loyalty/EarnPoints';
import { WeighedNotice } from '../weight/Weight';

import { CartCode } from './CartCode';
import { DiscountsCombine } from './DiscountsCombine';
import { FreeShippingProgress, GiftProgress } from './PromoProgress';

// Subtotal, the promotion bars, itemised adjustments and the way to checkout. Checkout is blocked
// while a sold-out line is in the cart, with a reason the button points at (aria-describedby),
// because a silently dead button is the worst way to say "no". Every figure after the subtotal is
// the pricing engine's: the browser adds nothing up (the estimate is labelled as one, because
// checkout prices the delivery method actually chosen).
export function CartSummary({
  cart,
  compact = false,
  onNavigate,
  className,
}: {
  cart: WebCart;
  compact?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const { t } = useT();
  const fmt = useFormat();
  const noteId = useId();
  const blocked = cart.items.some((item) => item.available === 0);
  const threshold = useFreeShippingThreshold();
  const { pricing } = cart;
  // The engine's bar counts the cart after discounts, like the real free-delivery rule. The
  // shipping quotes are the fallback for a cart priced before the engine had a threshold.
  const fromEngine = pricing.progress.freeShipping;
  const shipping =
    fromEngine ?? (threshold === null ? null : freeShippingProgress(cart.subtotalCents, threshold));
  const money = (cents: number) => fmt.money(cents, cart.currency);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">{t('cart.summary.subtotal')}</span>
        <span className="font-display text-xl font-bold" data-testid={TEST_IDS.cartSubtotal}>
          {money(cart.subtotalCents)}
        </span>
      </div>

      {pricing.adjustments.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label={t('cart.summary.discountsApplied')}>
          {pricing.adjustments.map((a) => (
            <li
              key={`${a.type}:${a.refId}`}
              data-testid={TEST_IDS.cartAdjustment}
              className="flex items-baseline justify-between gap-4 text-success"
            >
              <span className="min-w-0 break-words">{a.label}</span>
              <span className="shrink-0 font-semibold">
                {a.scope === 'shipping' ? t('cart.summary.freeDelivery') : `-${money(a.cents)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {shipping && (
        <FreeShippingProgress
          percent={shipping.percent}
          remainingCents={shipping.remainingCents}
          currency={cart.currency}
        />
      )}
      <GiftProgress pricing={pricing} currency={cart.currency} />

      {!compact && (
        <>
          <NextDelivery />
          <CartCode cart={cart} />
          <dl className="flex flex-col gap-1 border-t-2 border-line pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t('cart.summary.shippingEstimate')}</dt>
              <dd className="font-semibold">
                {pricing.shippingEstimateCents === 0
                  ? t('cart.summary.free')
                  : money(pricing.shippingEstimateCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-bold">{t('cart.summary.estimatedTotal')}</dt>
              <dd
                className="font-display text-xl font-bold"
                data-testid={TEST_IDS.cartTotalEstimate}
              >
                {money(pricing.totalEstimateCents)}
              </dd>
            </div>
          </dl>
          <WeighedNotice
            items={cart.items}
            totalCents={pricing.totalEstimateCents}
            currency={cart.currency}
          />
          <EarnPoints merchandiseCents={pricing.merchandiseCents} returnTo="/cart" />
          <p className="text-sm text-muted">{t('cart.summary.noTax')}</p>
          <DiscountsCombine />
        </>
      )}

      {blocked ? (
        <>
          <Button size="lg" disabled aria-describedby={noteId} data-testid={TEST_IDS.cartCheckout}>
            {t('cart.summary.checkout')}
          </Button>
          <p id={noteId} className="text-sm font-semibold text-danger">
            {t('cart.summary.soldOutBlock')}
          </p>
        </>
      ) : (
        <Link
          to="/checkout"
          onClick={onNavigate}
          data-testid={TEST_IDS.cartCheckout}
          className={buttonClasses('primary', 'lg')}
        >
          {t('cart.summary.checkout')}
        </Link>
      )}
    </div>
  );
}
