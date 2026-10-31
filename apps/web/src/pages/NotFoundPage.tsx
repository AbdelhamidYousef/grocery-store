import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { PETS } from '../lib/pets';

// One 404 for every kind of missing thing; `what` only changes the wording. A dead end is the
// worst place to leave a shopper, so the page also lists the way back into the catalogue.
export default function NotFoundPage({
  what = 'page',
}: {
  what?: 'page' | 'product' | 'category' | 'brand' | 'collection';
}) {
  return (
    <Container className="py-16 text-center" data-testid="page-not-found">
      <Seo title={`${what.charAt(0).toUpperCase()}${what.slice(1)} not found`} noindex />
      <p className="font-display text-6xl font-bold text-primary-strong" aria-hidden="true">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold">We can&apos;t find that {what}</h1>
      <p className="mt-3 text-muted">
        {what === 'product'
          ? 'It may have been retired, or the link may be old.'
          : 'The link may be old, or the page may have moved.'}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-display font-semibold text-surface hover:bg-primary-hover"
      >
        Back to the shop
      </Link>
      <p className="mt-8 text-sm font-semibold text-muted">Or have a look at</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {PETS.map((pet) => (
          <li key={pet.slug} data-pet={pet.accent}>
            <Link
              to={`/c/${pet.slug}`}
              className="inline-flex min-h-11 items-center rounded-full bg-pet-soft px-4 font-display font-semibold text-pet-strong"
            >
              {pet.name}
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
