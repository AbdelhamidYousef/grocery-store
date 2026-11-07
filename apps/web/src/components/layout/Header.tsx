import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { PetSwitcher } from '../../features/pets/PetSwitcher';
import { PETS } from '../../lib/pets';
import { TEST_IDS } from '../../lib/test-ids';
import { CartIcon, MenuIcon, PawIcon, PetGlyph } from '../icons';

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
  const cartLabel = `Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface" data-testid="header">
      <Container className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 lg:flex-nowrap">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          data-testid="mobile-nav-button"
          onClick={() => setMenuOpen(true)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-pet-soft lg:hidden"
        >
          <MenuIcon />
        </button>

        <Link
          to="/"
          aria-label="Pawsome home"
          data-testid="logo"
          className="mr-auto flex min-h-11 items-center gap-2 rounded-control font-display text-2xl font-bold text-primary-strong lg:mr-0"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bright text-ink">
            <PawIcon width={22} height={22} />
          </span>
          Pawsome
        </Link>

        {/* Desktop: search sits inline. Mobile: it wraps to its own full-width row (order-last). */}
        <div className="order-last w-full lg:order-none lg:mx-4 lg:max-w-md lg:flex-1">
          <SearchBox idPrefix="header" />
        </div>

        <div className="flex items-center gap-1 lg:ml-auto">
          <div className="hidden lg:block">
            <PetSwitcher />
          </div>
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

      <nav aria-label="Shop by pet" className="hidden border-t border-line lg:block">
        <Container>
          <ul className="flex items-center gap-2 py-2" data-testid="main-nav">
            {PETS.map((pet) => (
              <li key={pet.slug} data-pet={pet.accent}>
                <NavLink
                  to={`/c/${pet.slug}`}
                  className="flex min-h-11 items-center gap-2 rounded-full px-4 font-display font-semibold hover:bg-pet-soft aria-[current=page]:bg-pet-soft"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pet-accent text-ink">
                    <PetGlyph icon={pet.icon} width={18} height={18} />
                  </span>
                  {pet.name}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink
                to="/brands"
                className="flex min-h-11 items-center rounded-full px-4 font-display font-semibold hover:bg-pet-soft aria-[current=page]:bg-pet-soft"
              >
                Brands
              </NavLink>
            </li>
          </ul>
        </Container>
      </nav>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
