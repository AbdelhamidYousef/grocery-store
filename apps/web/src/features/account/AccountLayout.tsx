import { NavLink, Outlet } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { useT, type StringKey } from '../../i18n';
import { useAuth } from '../auth/AuthProvider';

const LINKS: readonly { to: string; label: StringKey; end: boolean }[] = [
  { to: '/account', label: 'account.nav.profile', end: true },
  { to: '/account/security', label: 'account.nav.security', end: false },
  { to: '/account/addresses', label: 'account.nav.addresses', end: false },
  { to: '/account/orders', label: 'account.nav.orders', end: false },
  { to: '/account/buy-again', label: 'account.nav.buyAgain', end: false },
  { to: '/account/rewards', label: 'account.nav.rewards', end: false },
];

// The side nav is a row of wrapping pills on phones and a column from `md` up, so there is never
// a horizontal scrollbar however many links it grows to.
export function AccountLayout() {
  const { user } = useAuth();
  const { t } = useT();
  return (
    <Container className="py-8" data-testid="page-account">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('account.title')}</h1>
      {user && (
        <p className="mt-1 break-words text-muted" data-testid="account-greeting">
          {t('account.signedInAs', {
            first: user.firstName,
            last: user.lastName,
            email: user.email,
          })}
        </p>
      )}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
        <nav aria-label={t('account.nav.label')} data-testid="account-nav">
          <ul className="flex flex-wrap gap-2 md:flex-col">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className="flex min-h-11 items-center rounded-full border-2 border-line px-4 font-display font-semibold hover:bg-pet-soft aria-[current=page]:border-primary aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-strong md:rounded-control"
                >
                  {t(link.label)}
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
