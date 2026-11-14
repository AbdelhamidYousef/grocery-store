import { formatMoney } from '@store/shared';
import { useId } from 'react';
import { Link } from 'react-router-dom';

import type { WebCart } from '../../api/cart';
import { buttonClasses, Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { freeShippingProgress } from '../../lib/shipping';
import { TEST_IDS } from '../../lib/test-ids';
import { useFreeShippingThreshold } from '../checkout/queries';
import { EarnPoints } from '../loyalty/EarnPoints';

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
  const noteId = useId();
  const blocked = cart.items.some((item) => item.available === 0);
  const threshold = useFreeShippingThreshold();
  const { pricing } = cart;
  // The engine's bar counts the cart after discounts, like the real free-delivery rule. The
  // shipping quotes are the fallback for a cart priced before the engine had a threshold.
  const fromEngine = pricing.progress.freeShipping;
  const shipping =
    fromEngine ?? (threshold === null ? null : freeShippingProgress(cart.subtotalCents, threshold));
  const money = (cents: number) => formatMoney(cents, cart.currency);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">Subtotal</span>
        <span className="font-display text-xl font-bold" data-testid={TEST_IDS.cartSubtotal}>
          {money(cart.subtotalCents)}
        </span>
      </div>

      {pricing.adjustments.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Discounts applied">
          {pricing.adjustments.map((a) => (
            <li
              key={`${a.type}:${a.refId}`}
              data-testid={TEST_IDS.cartAdjustment}
              className="flex items-baseline justify-between gap-4 text-success"
            >
              <span className="min-w-0 break-words">{a.label}</span>
              <span className="shrink-0 font-semibold">
                {a.scope === 'shipping' ? 'Free delivery' : `-${money(a.cents)}`}
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
          <CartCode cart={cart} />
          <dl className="flex flex-col gap-1 border-t-2 border-line pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Shipping (estimate, standard delivery)</dt>
              <dd className="font-semibold">
                {pricing.shippingEstimateCents === 0
                  ? 'Free'
                  : money(pricing.shippingEstimateCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-bold">Estimated total</dt>
              <dd
                className="font-display text-xl font-bold"
                data-testid={TEST_IDS.cartTotalEstimate}
              >
                {money(pricing.totalEstimateCents)}
              </dd>
            </div>
          </dl>
          <EarnPoints merchandiseCents={pricing.merchandiseCents} returnTo="/cart" />
          <p className="text-sm text-muted">Demo store: no tax is charged.</p>
          <DiscountsCombine />
        </>
      )}

      {blocked ? (
        <>
          <Button size="lg" disabled aria-describedby={noteId} data-testid={TEST_IDS.cartCheckout}>
            Proceed to checkout
          </Button>
          <p id={noteId} className="text-sm font-semibold text-danger">
            Remove the sold-out items to continue.
          </p>
        </>
      ) : (
        <Link
          to="/checkout"
          onClick={onNavigate}
          data-testid={TEST_IDS.cartCheckout}
          className={buttonClasses('primary', 'lg')}
        >
          Proceed to checkout
        </Link>
      )}
    </div>
  );
}
