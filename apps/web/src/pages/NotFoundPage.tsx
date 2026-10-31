import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';

export default function NotFoundPage() {
  return (
    <Container className="py-16 text-center" data-testid="page-not-found">
      <Seo title="Page not found" noindex />
      <p className="font-display text-6xl font-bold text-primary-strong" aria-hidden="true">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold">We can&apos;t find that page</h1>
      <p className="mt-3 text-muted">The link may be old, or the page may have moved.</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-display font-semibold text-surface hover:bg-primary-hover"
      >
        Back to the shop
      </Link>
    </Container>
  );
}
