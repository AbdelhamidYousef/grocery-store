import { Link } from 'react-router-dom';

import { LEGAL_PAGES } from '../../features/legal/pages';
import { PETS } from '../../lib/pets';
import { track } from '../../lib/track';
import { PawIcon } from '../icons';

import { Container } from './Container';

const linkClass =
  'inline-flex min-h-11 items-center rounded-control font-semibold underline-offset-2 hover:underline';

interface FooterLink {
  label: string;
  to: string;
}
interface FooterGroup {
  title: string;
  links: FooterLink[];
}

const legal = (path: string): FooterLink => {
  const page = LEGAL_PAGES.find((p) => p.path === path);
  return { label: page?.title ?? path, to: `/${path}` };
};

// Guide topics are listed by name: they come from the seeded Markdown, and a topic with no guides
// simply shows the guides page's empty state instead of breaking.
const GUIDE_TOPICS = ['Dogs', 'Cats', 'Birds', 'Fish', 'Small pets'];

const GROUPS: FooterGroup[] = [
  {
    title: 'Shop',
    links: [
      ...PETS.map((pet) => ({ label: pet.name, to: `/c/${pet.slug}` })),
      { label: 'Brands', to: '/brands' },
    ],
  },
  {
    title: 'Guides',
    links: [
      { label: 'All guides', to: '/guides' },
      ...GUIDE_TOPICS.map((name) => ({
        label: name,
        to: `/guides?category=${name.toLowerCase().replace(/\s+/g, '-')}`,
      })),
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Help centre', to: '/help' },
      { label: 'Track your order', to: '/track-order' },
      legal('shipping'),
      legal('returns'),
    ],
  },
  {
    title: 'Company',
    links: [legal('about'), legal('accessibility'), { label: 'My account', to: '/account' }],
  },
  {
    title: 'Legal',
    links: [
      legal('privacy'),
      legal('terms'),
      legal('cookies'),
      { label: 'Withdraw from contract', to: '/withdraw' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 bg-ink text-surface" data-testid="footer">
      <Container className="grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-6">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <p className="flex items-center gap-2 font-display text-2xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bright text-ink">
              <PawIcon width={22} height={22} />
            </span>
            Pawsome
          </p>
          <p className="max-w-xs text-surface">
            Happy-tail supplies for dogs, cats, birds, fish, reptiles and small pets.
          </p>
        </div>

        {/* One click handler per group (events bubble), so a later analytics project sees which
            column people use without a handler on every link. */}
        {GROUPS.map((group) => (
          <nav
            key={group.title}
            aria-label={group.title}
            className="flex flex-col"
            onClick={(e) => {
              const link = (e.target as HTMLElement).closest('a');
              if (link) track({ name: 'footer_link', group: group.title, label: link.textContent });
            }}
          >
            <h2 className="mb-1 text-lg font-bold">{group.title}</h2>
            {group.links.map((link) => (
              <Link key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </Container>
      <div className="border-t border-muted">
        <Container className="flex flex-col gap-2 py-4 text-sm text-surface sm:flex-row sm:justify-between">
          <p data-testid="payment-note">
            Payments run in Stripe test mode: no real orders are taken and no card is ever charged.
          </p>
          <p>
            &copy; {new Date().getFullYear()} Pawsome demo store, a fictional company. Not legal
            advice.
          </p>
        </Container>
      </div>
    </footer>
  );
}
