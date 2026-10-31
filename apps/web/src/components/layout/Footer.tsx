import { Link } from 'react-router-dom';

import { PETS } from '../../lib/pets';
import { PawIcon } from '../icons';

import { Container } from './Container';

const linkClass =
  'inline-flex min-h-11 items-center rounded-control font-semibold underline-offset-2 hover:underline';

export function Footer() {
  return (
    <footer className="mt-16 bg-ink text-surface" data-testid="footer">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <p className="flex items-center gap-2 font-display text-2xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bright text-ink">
              <PawIcon width={22} height={22} />
            </span>
            Pawsome
          </p>
          <p className="max-w-xs text-surface">
            Happy-tail supplies for dogs, cats, birds, fish and small pets.
          </p>
        </div>

        <nav aria-label="Shop" className="flex flex-col">
          <h2 className="mb-1 text-lg font-bold">Shop</h2>
          {PETS.map((pet) => (
            <Link key={pet.slug} to={`/c/${pet.slug}`} className={linkClass}>
              {pet.name}
            </Link>
          ))}
        </nav>

        <nav aria-label="Account and help" className="flex flex-col">
          <h2 className="mb-1 text-lg font-bold">Your account</h2>
          <Link to="/account" className={linkClass}>
            My account
          </Link>
          <Link to="/cart" className={linkClass}>
            Cart
          </Link>
          <Link to="/search" className={linkClass}>
            Search
          </Link>
        </nav>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">About this store</h2>
          <p className="text-surface">
            Pawsome is a fictional demo shop built as a portfolio project. Payments run in Stripe
            test mode, so no real orders are taken and no card is ever charged.
          </p>
        </div>
      </Container>
      <div className="border-t border-muted">
        <Container className="py-4 text-sm text-surface">
          &copy; {new Date().getFullYear()} Pawsome demo store
        </Container>
      </div>
    </footer>
  );
}
