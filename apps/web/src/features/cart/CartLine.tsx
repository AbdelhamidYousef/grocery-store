import { Link } from 'react-router-dom';

import type { CartWarning, WebCart, WebCartItem } from '../../api/cart';
import { Badge } from '../../components/ui/Badge';
import { SalePrice } from '../../components/ui/SalePrice';
import { useT, type TFunction } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { cn } from '../../lib/cn';
import { image600 } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';
import { QuantityStepper } from '../catalog/QuantityStepper';

import { noticeKey } from './queries';

// Codes that describe ONE line and are shown on it. Everything else (a removed line, a code this
// build does not know) goes to the banner above the cart.
export const INLINE_NOTICE_CODES = ['QTY_REDUCED', 'PRICE_CHANGED'];

export function noticeText(w: CartWarning, t: TFunction, money: (cents: number) => string): string {
  switch (w.code) {
    case 'QTY_REDUCED':
      if (w.quantity === undefined) return t('cart.notice.qtyReducedNoDetail');
      return w.previousQuantity === undefined
        ? t('cart.notice.qtyReduced', { quantity: w.quantity })
        : t('cart.notice.qtyReducedFrom', { quantity: w.quantity, previous: w.previousQuantity });
    case 'PRICE_CHANGED':
      return w.previousUnitPriceCents !== undefined && w.unitPriceCents !== undefined
        ? t('cart.notice.priceChanged', {
            from: money(w.previousUnitPriceCents),
            to: money(w.unitPriceCents),
          })
        : t('cart.notice.priceChangedNoDetail');
    case 'VARIANT_UNAVAILABLE':
      return t('cart.notice.unavailable', { product: w.productName, variant: w.variantName });
    default:
      // A code from a newer API: say something true without pretending to know the details.
      return t('cart.notice.changed', { product: w.productName, variant: w.variantName });
  }
}

interface CartLineProps {
  item: WebCartItem;
  /** The engine's line for this item (the price it really pays). */
  priced?: WebCart['pricing']['lines'][number] | undefined;
  currency: string;
  compact?: boolean;
  notices: CartWarning[];
  onDismissNotice: (key: string) => void;
  onQuantity: (item: WebCartItem, quantity: number) => void;
  onRemove: (item: WebCartItem) => void;
  /** Called when the product link is followed (the mini cart closes itself). */
  onNavigate?: () => void;
}

export function CartLine({
  item,
  priced,
  currency,
  compact = false,
  notices,
  onDismissNotice,
  onQuantity,
  onRemove,
  onNavigate,
}: CartLineProps) {
  const { t } = useT();
  const fmt = useFormat();
  const soldOut = item.available === 0;
  // The price a line really pays is the engine's (sale, member or base), not the catalog price on
  // the item; a line the engine did not price (sold out) falls back to the item's own figures.
  const engine = soldOut ? undefined : priced;
  const unitCents = engine?.unitCents ?? item.unitPriceCents;
  const lineTotal = engine ? engine.unitCents * item.quantity : item.lineTotalCents;
  // A flash-sale line also shows the EU Omnibus reference next to its price.
  const onSale = engine?.priceSource === 'sale';
  const isMember = engine?.priceSource === 'member';
  const imageSize = compact ? 'h-16 w-16' : 'h-20 w-20 sm:h-24 sm:w-24';
  return (
    <li
      data-testid={TEST_IDS.cartLine}
      data-sold-out={soldOut || undefined}
      className="flex gap-3 border-b border-line py-4 last:border-b-0"
    >
      <Link
        to={`/products/${item.productSlug}`}
        onClick={onNavigate}
        tabIndex={-1}
        aria-hidden="true"
        className={cn('shrink-0', soldOut && 'opacity-50 grayscale')}
      >
        {item.imageUrl ? (
          <img
            src={image600(item.imageUrl)}
            alt=""
            width={96}
            height={96}
            loading="lazy"
            className={cn(imageSize, 'rounded-control bg-dept-soft object-cover')}
          />
        ) : (
          <span className={cn(imageSize, 'block rounded-control bg-dept-soft')} />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className={cn('min-w-0', soldOut && 'opacity-60')}>
          <Link
            to={`/products/${item.productSlug}`}
            onClick={onNavigate}
            className="line-clamp-3 break-words font-display font-bold hover:underline"
          >
            {item.productName}
          </Link>
          <p className="break-words text-sm text-muted">{item.variantName}</p>
          {onSale ? (
            <p className="text-sm text-muted" data-testid="cart-line-sale">
              <SalePrice
                sale={{ priceCents: engine.unitCents, referenceCents: engine.referenceCents }}
                currency={currency}
                className="[&_[data-testid=sale-price]]:text-base"
              />
              <span className="sr-only">{t('cart.line.eachSr')}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">
              {t('cart.line.each', { price: fmt.money(unitCents, currency) })}
              {isMember && (
                <Badge tone="primary" className="ml-2" data-testid="cart-line-member">
                  {t('cart.line.memberPrice')}
                </Badge>
              )}
            </p>
          )}
        </div>

        {soldOut && (
          <p data-testid={TEST_IDS.cartLineWarning} className="text-sm font-semibold text-danger">
            <Badge tone="danger" className="mr-2">
              {t('cart.line.soldOut')}
            </Badge>
            {t('cart.line.soldOutNote')}
          </p>
        )}

        {notices.map((w) => (
          <div
            key={noticeKey(w)}
            role="status"
            data-testid={TEST_IDS.cartLineWarning}
            className="flex items-start gap-2 rounded-control bg-primary-soft p-2 text-sm font-semibold text-primary-strong"
          >
            <p className="min-w-0 flex-1 break-words">
              {noticeText(w, t, (cents) => fmt.money(cents, currency))}
            </p>
            <button
              type="button"
              onClick={() => onDismissNotice(noticeKey(w))}
              className="-my-1 min-h-9 shrink-0 rounded-control px-2 underline"
            >
              {t('cart.line.ok')}
              <span className="sr-only">
                {t('cart.line.okDismiss', { name: item.productName })}
              </span>
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div data-testid={TEST_IDS.cartLineQty}>
            <QuantityStepper
              value={item.quantity}
              max={Math.max(1, item.maxQty)}
              disabled={soldOut}
              subject={item.productName}
              deferred
              onChange={(quantity) => onQuantity(item, quantity)}
            />
            {!soldOut && item.quantity >= item.maxQty && (
              <p className="mt-1 text-xs font-semibold text-muted">{t('cart.line.maxAvailable')}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid={TEST_IDS.cartLineRemove}
              aria-label={t('cart.line.removeAria', { name: item.productName })}
              onClick={() => onRemove(item)}
              className="min-h-11 rounded-control px-2 text-sm font-semibold text-danger underline"
            >
              {t('cart.line.remove')}
            </button>
            <span
              className={cn(
                'font-display font-bold',
                soldOut && 'text-muted line-through',
                compact ? 'text-base' : 'text-lg',
              )}
              data-testid="cart-line-total"
            >
              {fmt.money(lineTotal, currency)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
