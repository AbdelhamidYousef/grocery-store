import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { buttonClasses, Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useAddresses } from '../features/account/queries';
import { useAuth } from '../features/auth/AuthProvider';
import { SessionExpiredNotice } from '../features/auth/SessionExpiredNotice';
import { useCart } from '../features/cart/queries';
import { CheckoutFlow } from '../features/checkout/CheckoutFlow';
import { useT } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

export default function CheckoutPage() {
  const { t } = useT();
  const { data: cart, isPending, error, refetch } = useCart();
  const { user, status } = useAuth();
  const addresses = useAddresses({ enabled: status === 'authenticated' });

  // Fired once per visit, when there is something to check out.
  const began = useRef(false);
  const hasItems = (cart?.items.length ?? 0) > 0;
  useEffect(() => {
    if (!cart || !hasItems || began.current) return;
    began.current = true;
    track({
      name: 'begin_checkout',
      valueCents: cart.subtotalCents,
      currency: cart.currency,
      items: cart.items.map((i) => ({
        id: i.productId,
        name: i.productName,
        price: i.unitPriceCents,
        variant: i.sku,
      })),
    });
  }, [cart, hasItems]);

  // The form is pre-filled once for a signed-in shopper, so wait until we know who they are and
  // (if signed in) what addresses they have; an address error just means "no pre-fill".
  const prefillReady = status !== 'loading' && (status === 'anonymous' || !addresses.isPending);
  const soldOut = cart?.items.some((i) => i.available === 0) ?? false;

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageCheckout}>
      <Seo title={t('checkout.title')} noindex />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('checkout.title')}</h1>
        <Link to="/cart" className="font-semibold text-primary-strong underline">
          {t('checkout.backToCart')}
        </Link>
      </div>
      <SessionExpiredNotice signInNext="/checkout" />

      {(isPending || (cart && !prefillReady && hasItems && !soldOut)) && (
        <div className="mt-6 flex flex-col gap-4" aria-busy="true">
          <p className="sr-only" role="status">
            {t('checkout.loading')}
          </p>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {error && !cart && (
        <div className="mt-6" role="alert">
          <p className="font-semibold text-danger">{t('checkout.cartLoadError')}</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            {t('checkout.tryAgain')}
          </Button>
        </div>
      )}

      {cart && !hasItems && (
        <div className="mt-8 flex flex-col items-start gap-4" data-testid={TEST_IDS.cartEmpty}>
          <p className="text-lg">{t('checkout.empty')}</p>
          <Link to="/" className={buttonClasses('primary', 'lg')}>
            {t('checkout.continueShopping')}
          </Link>
        </div>
      )}

      {cart && hasItems && soldOut && (
        <div className="mt-8 flex flex-col items-start gap-4" role="alert">
          <p className="font-semibold text-danger">{t('checkout.soldOut')}</p>
          <Link to="/cart" className={buttonClasses('primary', 'lg')}>
            {t('checkout.reviewCart')}
          </Link>
        </div>
      )}

      {cart && hasItems && !soldOut && prefillReady && (
        <div className="mt-6">
          <CheckoutFlow cart={cart} user={user} addresses={addresses.data} />
        </div>
      )}
    </Container>
  );
}
