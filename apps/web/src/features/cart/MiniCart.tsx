import { Link } from 'react-router-dom';

import { buttonClasses } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { TEST_IDS } from '../../lib/test-ids';

import { CartContents } from './CartContents';
import { CartSummary } from './CartSummary';
import { useCart } from './queries';

// The cart in a side drawer, opened from the header icon. It is the same lines and summary as the
// cart page in compact form, so a fix to one is a fix to both.
export function MiniCart({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Your cart" placement="right">
      {open && <MiniCartBody onClose={onClose} />}
    </Dialog>
  );
}

function MiniCartBody({ onClose }: { onClose: () => void }) {
  const { data: cart, isPending, error, refetch } = useCart();
  return (
    <div data-testid={TEST_IDS.miniCart} className="flex min-h-[calc(100dvh-3rem)] flex-col gap-4">
      {isPending && <Skeleton className="h-24 w-full" />}
      {error && !cart && (
        <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
          We could not load your cart. Try again
        </button>
      )}
      {cart && cart.items.length === 0 && (
        <p data-testid={TEST_IDS.cartEmpty}>Your cart is empty.</p>
      )}
      {cart && cart.items.length > 0 && <CartContents cart={cart} compact onNavigate={onClose} />}
      {/* Pinned to the bottom of the drawer: with 15 lines the total and the checkout button
          would otherwise sit 3000px down. The negative margins cancel the dialog's padding so the
          bar spans the full drawer width. */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-auto flex flex-col gap-3 border-t-2 border-line bg-surface p-4">
        {cart && cart.items.length > 0 && <CartSummary cart={cart} compact onNavigate={onClose} />}
        <Link
          to="/cart"
          onClick={onClose}
          data-testid="mini-cart-view"
          className={buttonClasses('secondary', 'md')}
        >
          View cart
        </Link>
      </div>
    </div>
  );
}
