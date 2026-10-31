import about from '../../content/legal/about.md?raw';
import accessibility from '../../content/legal/accessibility.md?raw';
import cookies from '../../content/legal/cookies.md?raw';
import privacy from '../../content/legal/privacy.md?raw';
import returns from '../../content/legal/returns.md?raw';
import shipping from '../../content/legal/shipping.md?raw';
import terms from '../../content/legal/terms.md?raw';

export interface LegalPageDef {
  /** URL path segment: `/privacy`. */
  path: string;
  title: string;
  description: string;
  body: string;
}

// One entry per static page. The Markdown files are the copy (plain files, easy to replace); the
// router table in routes.tsx and the footer both read this list, so a page cannot exist without a
// route or a link by accident.
export const LEGAL_PAGES: readonly LegalPageDef[] = [
  {
    path: 'about',
    title: 'About Pawsome',
    description: 'Who is behind this demo pet shop.',
    body: about,
  },
  {
    path: 'shipping',
    title: 'Shipping',
    description: 'Delivery options, prices and times.',
    body: shipping,
  },
  {
    path: 'returns',
    title: 'Returns and withdrawal',
    description: 'How returns and withdrawal work.',
    body: returns,
  },
  {
    path: 'privacy',
    title: 'Privacy notice',
    description: 'What data we collect and why.',
    body: privacy,
  },
  {
    path: 'terms',
    title: 'Terms and conditions',
    description: 'Sample terms for the demo store.',
    body: terms,
  },
  {
    path: 'cookies',
    title: 'Cookies',
    description: 'The cookies we set, and the ones we do not.',
    body: cookies,
  },
  {
    path: 'accessibility',
    title: 'Accessibility statement',
    description: 'Our accessibility aims and known gaps.',
    body: accessibility,
  },
];
