import type { WebCart } from '../../api/cart';

import { CartLine } from './CartLine';
import { CartNotices, useBannerNotices } from './CartNotices';
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
  const actions = useCartActions();
  const { inlineFor, banner, dismiss } = useBannerNotices(cart);
  return (
    <>
      <CartNotices notices={banner} currency={cart.currency} onDismiss={dismiss} />
      <ul aria-label="Items in your cart" className="flex flex-col">
        {cart.items.map((item) => (
          <CartLine
            key={item.id}
            item={item}
            currency={cart.currency}
            compact={compact}
            notices={inlineFor(item.variantId)}
            onDismissNotice={dismiss}
            onQuantity={actions.setQuantity}
            onRemove={actions.remove}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ))}
      </ul>
    </>
  );
}
