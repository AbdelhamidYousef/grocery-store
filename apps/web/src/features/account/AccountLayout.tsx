import { NavLink, Outlet } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { useAuth } from '../auth/AuthProvider';

const LINKS = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/security', label: 'Security', end: false },
  { to: '/account/addresses', label: 'Addresses', end: false },
  { to: '/account/pets', label: 'Pets', end: false },
  { to: '/account/orders', label: 'Orders', end: false },
] as const;

// The side nav is a row of wrapping pills on phones and a column from `md` up, so there is never
// a horizontal scrollbar however many links it grows to.
export function AccountLayout() {
  const { user } = useAuth();
  return (
    <Container className="py-8" data-testid="page-account">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">My account</h1>
      {user && (
        <p className="mt-1 break-words text-muted" data-testid="account-greeting">
          Signed in as {user.firstName} {user.lastName} ({user.email})
        </p>
      )}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
        <nav aria-label="Account" data-testid="account-nav">
          <ul className="flex flex-wrap gap-2 md:flex-col">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className="flex min-h-11 items-center rounded-full border-2 border-line px-4 font-display font-semibold hover:bg-pet-soft aria-[current=page]:border-primary aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-strong md:rounded-control"
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </Container>
  );
}
