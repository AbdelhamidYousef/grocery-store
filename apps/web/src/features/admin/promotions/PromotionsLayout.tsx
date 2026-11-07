import { NavLink, Outlet } from 'react-router-dom';

import { Seo } from '../../../components/Seo';

const TABS = [
  { to: '/admin/promotions/codes', label: 'Codes' },
  { to: '/admin/promotions/tiers', label: 'Bulk tiers' },
  { to: '/admin/promotions/gift', label: 'Gift' },
  { to: '/admin/promotions/flash-sales', label: 'Flash sales' },
] as const;

// One nav item in the back office; the four rule screens are tabs inside it. The tab row wraps
// on a phone instead of scrolling, so it can never widen the page.
export function PromotionsLayout() {
  return (
    <div data-testid="admin-promotions" className="flex flex-col gap-4">
      <Seo title="Promotions" noindex />
      <h2 className="font-display text-xl font-bold">Promotions</h2>
      <nav aria-label="Promotions" data-testid="promotions-tabs">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className="flex min-h-11 items-center rounded-full border-2 border-line px-4 font-display font-semibold hover:bg-pet-soft aria-[current=page]:border-primary aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-strong"
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
