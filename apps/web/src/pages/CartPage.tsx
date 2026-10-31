import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { buttonClasses, Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { CartContents } from '../features/cart/CartContents';
import { CartSummary } from '../features/cart/CartSummary';
import { useCart } from '../features/cart/queries';
import { TEST_IDS } from '../lib/test-ids';

export default function CartPage() {
  const { data: cart, isPending, error, refetch } = useCart();

  return (
    <Container className="py-8" data-testid={TEST_IDS.cartPage}>
      <Seo title="Your cart" noindex />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Your cart</h1>

      {isPending && (
        <div className="mt-6 flex flex-col gap-4" aria-busy="true">
          <p className="sr-only" role="status">
            Loading your cart
          </p>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {error && !cart && (
        <div className="mt-6" role="alert">
          <p className="font-semibold text-danger">We could not load your cart.</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {cart && cart.items.length === 0 && (
        <div className="mt-8 flex flex-col items-start gap-4" data-testid={TEST_IDS.cartEmpty}>
          <p className="text-lg">Your cart is empty. Time to find something waggy!</p>
          <Link to="/" className={buttonClasses('primary', 'lg')}>
            Continue shopping
          </Link>
        </div>
      )}

      {cart && cart.items.length > 0 && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <div className="min-w-0">
            <CartContents cart={cart} />
          </div>
          {/* Sticks to the bottom edge on phones (so the total and the checkout button stay in
              reach however long the cart is) and to the top on desktop. */}
          <aside
            aria-label="Order summary"
            className="sticky bottom-0 z-10 -mx-4 border-t-2 border-line bg-surface p-4 shadow-card sm:-mx-6 sm:px-6 lg:bottom-auto lg:top-32 lg:mx-0 lg:rounded-card lg:border-2 lg:p-5"
          >
            <CartSummary cart={cart} />
          </aside>
        </div>
      )}
    </Container>
  );
}
