import { formatMoney } from '@store/shared';
import { Link } from 'react-router-dom';

import type { CartWarning, WebCartItem } from '../../api/cart';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/cn';
import { image600 } from '../../lib/images';
import { TEST_IDS } from '../../lib/test-ids';
import { QuantityStepper } from '../catalog/QuantityStepper';

import { noticeKey } from './queries';

// Codes that describe ONE line and are shown on it. Everything else (a removed line, a code this
// build does not know) goes to the banner above the cart.
export const INLINE_NOTICE_CODES = ['QTY_REDUCED', 'PRICE_CHANGED'];

export function noticeText(w: CartWarning, currency: string): string {
  switch (w.code) {
    case 'QTY_REDUCED':
      return w.quantity === undefined
        ? 'Not enough stock, so we lowered the quantity.'
        : `Only ${w.quantity} available, so we lowered the quantity${
            w.previousQuantity === undefined ? '' : ` from ${w.previousQuantity}`
          }.`;
    case 'PRICE_CHANGED':
      return w.previousUnitPriceCents !== undefined && w.unitPriceCents !== undefined
        ? `The price changed from ${formatMoney(w.previousUnitPriceCents, currency)} to ${formatMoney(w.unitPriceCents, currency)}.`
        : 'The price of this item changed.';
    case 'VARIANT_UNAVAILABLE':
      return `${w.productName} (${w.variantName}) is no longer available and was removed from your cart.`;
    default:
      // A code from a newer API: say something true without pretending to know the details.
      return `Something changed for ${w.productName} (${w.variantName}).`;
  }
}

interface CartLineProps {
  item: WebCartItem;
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
  currency,
  compact = false,
  notices,
  onDismissNotice,
  onQuantity,
  onRemove,
  onNavigate,
}: CartLineProps) {
  const soldOut = item.available === 0;
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
            className={cn(imageSize, 'rounded-control bg-pet-soft object-cover')}
          />
        ) : (
          <span className={cn(imageSize, 'block rounded-control bg-pet-soft')} />
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
          <p className="text-sm text-muted">{formatMoney(item.unitPriceCents, currency)} each</p>
        </div>

        {soldOut && (
          <p data-testid={TEST_IDS.cartLineWarning} className="text-sm font-semibold text-danger">
            <Badge tone="danger" className="mr-2">
              Sold out
            </Badge>
            Not included in your total. Remove it to check out.
          </p>
        )}

        {notices.map((w) => (
          <div
            key={noticeKey(w)}
            role="status"
            data-testid={TEST_IDS.cartLineWarning}
            className="flex items-start gap-2 rounded-control bg-primary-soft p-2 text-sm font-semibold text-primary-strong"
          >
            <p className="min-w-0 flex-1 break-words">{noticeText(w, currency)}</p>
            <button
              type="button"
              onClick={() => onDismissNotice(noticeKey(w))}
              className="-my-1 min-h-9 shrink-0 rounded-control px-2 underline"
            >
              OK<span className="sr-only">, dismiss notice about {item.productName}</span>
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
              <p className="mt-1 text-xs font-semibold text-muted">Maximum available</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid={TEST_IDS.cartLineRemove}
              aria-label={`Remove ${item.productName}`}
              onClick={() => onRemove(item)}
              className="min-h-11 rounded-control px-2 text-sm font-semibold text-danger underline"
            >
              Remove
            </button>
            <span
              className={cn(
                'font-display font-bold',
                soldOut && 'text-muted line-through',
                compact ? 'text-base' : 'text-lg',
              )}
              data-testid="cart-line-total"
            >
              {formatMoney(item.lineTotalCents, currency)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
