import { Link } from 'react-router-dom';

import { Container } from '../../components/layout/Container';

import { NewsletterForm } from './NewsletterForm';

// The homepage's `newsletter` slot (registered in features/home/builtin-slots.ts).
export function NewsletterSlot() {
  return (
    <section aria-labelledby="newsletter-heading" className="bg-pet-soft py-10">
      <Container>
        <h2 id="newsletter-heading" className="font-display text-2xl font-bold">
          Join the pack: 10% off your first order
        </h2>
        <p className="mb-4 mt-1 max-w-prose text-muted">
          Tips for your pets and the odd offer. We email a link to confirm first, and every message
          has a one-click unsubscribe. See the{' '}
          <Link to="/privacy" className="font-semibold text-primary-strong underline">
            privacy policy
          </Link>
          .
        </p>
        <NewsletterForm />
      </Container>
    </section>
  );
}
