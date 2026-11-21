import type { WebCart } from '../../api/cart';
import { useT } from '../../i18n';
import { ApplyToAll } from '../substitutions/ApplyToAll';

import { CartLine } from './CartLine';
import { CartNotices, useBannerNotices } from './CartNotices';
import { GiftLine } from './GiftLine';
import { useCartActions } from './queries';

// The notices and the list of lines, shared by the cart page and the mini cart (`compact`).
export function CartContents({
  cart,
  compact = false,
  onNavigate,
}: {
  cart: WebCart;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useT();
  const actions = useCartActions();
  const { inlineFor, banner, dismiss } = useBannerNotices(cart);
  return (
    <>
      <CartNotices notices={banner} currency={cart.currency} onDismiss={dismiss} />
      <ul aria-label={t('cart.items.aria')} className="flex flex-col">
        {cart.items.map((item) => (
          <CartLine
            key={item.id}
            item={item}
            priced={cart.pricing.lines.find((l) => l.variantId === item.variantId)}
            currency={cart.currency}
            compact={compact}
            notices={inlineFor(item.variantId)}
            onDismissNotice={dismiss}
            onQuantity={actions.setQuantity}
            onRemove={actions.remove}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ))}
        <GiftLine pricing={cart.pricing} currency={cart.currency} />
      </ul>
      {!compact && cart.items.some((i) => i.available > 0) && <ApplyToAll />}
    </>
  );
}
