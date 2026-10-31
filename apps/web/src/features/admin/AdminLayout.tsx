import { NavLink, Outlet } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { TEST_IDS } from '../../lib/test-ids';

const LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products', end: false },
  { to: '/admin/orders', label: 'Orders', end: false },
] as const;

// The back office frame: a compact menu above the content on phones (wrapping pills, so it can
// never widen the page) and a narrow sidebar from `md` up. `min-w-0` on the content column lets
// wide tables scroll inside their own container instead of stretching the grid track.
// Everything under /admin is `noindex`: pages here are never meant to be found.
export function AdminLayout() {
  return (
    <Container className="py-6" data-testid={TEST_IDS.pageAdmin}>
      <Seo title="Admin" noindex />
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Admin</h1>
      <div className="mt-4 grid gap-5 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
        <nav aria-label="Admin" data-testid={TEST_IDS.adminNav}>
          <ul className="flex flex-wrap gap-2 md:flex-col md:gap-1">
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
