import { Link } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { useT } from '../../i18n';

import { NewsletterForm } from './NewsletterForm';

// The homepage's `newsletter` slot (registered in features/home/builtin-slots.ts).
export function NewsletterSlot() {
  const { t } = useT();
  return (
    <section aria-labelledby="newsletter-heading" className="bg-dept-soft py-10">
      <Container>
        <h2 id="newsletter-heading" className="font-display text-2xl font-bold">
          {t('loyalty.newsletter.slotTitle')}
        </h2>
        <p className="mb-4 mt-1 max-w-prose text-muted">
          {t('loyalty.newsletter.slotText')}{' '}
          <Link to="/privacy" className="font-semibold text-primary-strong underline">
            {t('loyalty.newsletter.privacyLink')}
          </Link>
          .
        </p>
        <NewsletterForm />
      </Container>
    </section>
  );
}
