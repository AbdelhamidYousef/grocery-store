import { useId } from 'react';
import { Link } from 'react-router-dom';

import type { WebCart } from '../../api/cart';
import { buttonClasses, Button } from '../../components/ui/Button';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';
import { NextDelivery } from '../delivery/NextDelivery';
import { useSetBags } from '../delivery/slots';
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
  const setBags = useSetBags();
  const { pricing } = cart;
  const bill = pricing.bill;
  // The bar and every fee come from the server's bill (shared `basketTotals`): the goods after
  // discounts count towards free delivery, the deposit does not, and express is never free.
  const shipping = bill.freeDelivery;
  const belowMinimum = cart.items.length > 0 && !bill.minimumOrder.met;
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

      {shipping && !belowMinimum && (
        <FreeShippingProgress
          percent={shipping.percent}
          remainingCents={shipping.missingCents}
          currency={cart.currency}
        />
      )}
      <GiftProgress pricing={pricing} currency={cart.currency} />
      {belowMinimum && (
        <p
          role="status"
          data-testid={TEST_IDS.cartMinimum}
          className="rounded-control border-2 border-danger bg-danger-soft p-3 text-sm font-semibold text-danger"
        >
          {t('cart.summary.minimumNeeded', {
            amount: money(bill.minimumOrder.missingCents),
            minimum: money(bill.minimumOrder.minCents),
          })}
        </p>
      )}

      {!compact && (
        <>
          <NextDelivery />
          <CartCode cart={cart} />
          <dl className="flex flex-col gap-1 border-t-2 border-line pt-3 text-sm">
            {bill.depositCents > 0 && (
              <div className="flex justify-between gap-4" data-testid={TEST_IDS.cartDeposit}>
                <dt>{t('cart.summary.deposit')}</dt>
                <dd className="font-semibold">{money(bill.depositCents)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4" data-testid={TEST_IDS.cartBags}>
              <dt>
                {bill.bags
                  ? t('cart.summary.bags', { count: bill.bagCount })
                  : t('cart.summary.noBags')}
              </dt>
              <dd className="font-semibold">
                {bill.bags ? money(bill.bagFeeCents) : t('cart.summary.free')}
              </dd>
            </div>
            <div className="flex justify-between gap-4" data-testid={TEST_IDS.cartDeliveryFee}>
              <dt>
                {bill.deliveryEstimated
                  ? t('cart.summary.deliveryFrom')
                  : t('cart.summary.delivery')}
              </dt>
              <dd className="font-semibold">
                {bill.deliveryFeeCents === 0 && bill.deliveryFree
                  ? t('cart.summary.free')
                  : money(bill.deliveryFeeCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-bold">
                {bill.deliveryEstimated
                  ? t('cart.summary.estimatedTotal')
                  : t('cart.summary.total')}
              </dt>
              <dd
                className="font-display text-xl font-bold"
                data-testid={TEST_IDS.cartTotalEstimate}
              >
                {money(pricing.totalEstimateCents)}
              </dd>
            </div>
          </dl>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={bill.bags}
              disabled={setBags.isPending}
              onChange={(e) => setBags.mutate(e.target.checked)}
              data-testid={TEST_IDS.cartBagsToggle}
              className="h-5 w-5 accent-primary"
            />
            <span>{t('cart.summary.bagsToggle')}</span>
          </label>
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

      {blocked || belowMinimum ? (
        <>
          <Button size="lg" disabled aria-describedby={noteId} data-testid={TEST_IDS.cartCheckout}>
            {t('cart.summary.checkout')}
          </Button>
          <p id={noteId} className="text-sm font-semibold text-danger">
            {blocked
              ? t('cart.summary.soldOutBlock')
              : t('cart.summary.minimumNeeded', {
                  amount: money(bill.minimumOrder.missingCents),
                  minimum: money(bill.minimumOrder.minCents),
                })}
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
