import { formatMoney } from '@store/shared';
import { useId } from 'react';
import { Link } from 'react-router-dom';

import type { WebCart } from '../../api/cart';
import { buttonClasses, Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { freeShippingProgress } from '../../lib/shipping';
import { TEST_IDS } from '../../lib/test-ids';
import { useFreeShippingThreshold } from '../checkout/queries';

// Subtotal, the free-shipping hint and the way to checkout. Checkout is blocked while a sold-out
// line is in the cart, with a reason the button points at (aria-describedby), because a silently
// dead button is the worst way to say "no".
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
  const progress = threshold === null ? null : freeShippingProgress(cart.subtotalCents, threshold);
  const money = (cents: number) => formatMoney(cents, cart.currency);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">Subtotal</span>
        <span className="font-display text-xl font-bold" data-testid={TEST_IDS.cartSubtotal}>
          {money(cart.subtotalCents)}
        </span>
      </div>

      {progress && (
        <div data-testid={TEST_IDS.cartShippingHint}>
          <p className="text-sm">
            {progress.remainingCents === 0
              ? 'You get free standard shipping.'
              : `Add ${money(progress.remainingCents)} more for free standard shipping.`}
          </p>
          <div
            role="progressbar"
            aria-label="Progress to free shipping"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            className="mt-1 h-2 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {!compact && (
        <p className="text-sm text-muted">Shipping and taxes are worked out at checkout.</p>
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
