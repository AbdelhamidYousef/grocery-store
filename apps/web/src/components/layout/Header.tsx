import { useState } from 'react';
import { Link } from 'react-router-dom';

import { MegaMenu } from '../../features/navigation/MegaMenu';
import { StoreSwitcher } from '../../features/stores/StoreSwitcher';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';
import { CartIcon, HeartIcon, MenuIcon } from '../icons';
import { Logo } from '../Logo';

import { AccountMenu } from './AccountMenu';
import { Container } from './Container';
import { MobileNav } from './MobileNav';
import { SearchBox } from './SearchBox';

// `cartCount` is a prop because components never fetch: the cart feature owns the number and
// AppLayout passes it down. With `onOpenCart` the icon opens the mini cart drawer; without it
// (or on the cart and checkout pages, where a drawer would only repeat the page) it is a link.
export function Header({
  cartCount = 0,
  onOpenCart,
}: {
  cartCount?: number;
  onOpenCart?: (() => void) | undefined;
}) {
  const { t, tn } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const cartIcon = (
    <>
      <CartIcon />
      {cartCount > 0 && (
        <span
          aria-hidden="true"
          data-testid="cart-count"
          className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-surface"
        >
          {cartCount > 99 ? '99+' : cartCount}
        </span>
      )}
    </>
  );
  const cartLabel = tn('shell.header.cartLabel', cartCount);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface" data-testid="header">
      <Container className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 lg:flex-nowrap">
        <button
          type="button"
          aria-label={t('shell.header.openMenu')}
          aria-expanded={menuOpen}
          data-testid="mobile-nav-button"
          onClick={() => setMenuOpen(true)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-pet-soft lg:hidden"
        >
          <MenuIcon />
        </button>

        <Link
          to="/"
          aria-label={t('shell.header.home')}
          data-testid="logo"
          className="mr-auto flex min-h-11 items-center rounded-control text-primary-strong lg:mr-0"
        >
          <Logo />
        </Link>

        {/* Desktop: search sits inline. Mobile: it wraps to its own full-width row (order-last). */}
        <div className="order-last w-full lg:order-none lg:mx-4 lg:max-w-md lg:flex-1">
          <SearchBox idPrefix="header" />
        </div>

        <div className="flex items-center gap-1 lg:ml-auto">
          {/* Phones get the switcher in the footer: the header row is already full. */}
          <div className="hidden lg:block">
            <StoreSwitcher />
          </div>
          <Link
            to="/wishlist"
            aria-label={t('shell.header.wishlist')}
            data-testid="wishlist-link"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-pet-soft"
          >
            <HeartIcon />
          </Link>
          <AccountMenu />
          {onOpenCart ? (
            <button
              type="button"
              aria-label={cartLabel}
              aria-haspopup="dialog"
              data-testid={TEST_IDS.miniCartButton}
              onClick={onOpenCart}
              className="relative flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-pet-soft"
            >
              {cartIcon}
            </button>
          ) : (
            <Link
              to="/cart"
              aria-label={cartLabel}
              data-testid="cart-link"
              className="relative flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-pet-soft"
            >
              {cartIcon}
            </Link>
          )}
        </div>
      </Container>

      <nav
        aria-label={t('shell.shopByPet')}
        className="relative hidden border-t border-line lg:block"
      >
        <Container>
          <MegaMenu />
        </Container>
      </nav>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
