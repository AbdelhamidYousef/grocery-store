import { DEPARTMENTS } from '@store/shared';
import { useNavigate } from 'react-router-dom';

import { DepartmentGlyph } from '../../components/icons';
import { Container } from '../../components/layout/Container';
import { useT } from '../../i18n';
import { useDelivery } from '../delivery/DeliveryContext';
import { DeliveryResult } from '../delivery/DeliveryResult';
import { PostcodeForm } from '../delivery/PostcodeForm';

// The first screen: the promise, one box that starts the order, and a quiet picture made of the
// department icons (decoration only, so it is hidden from screen readers and from small phones).
export function HomeHero() {
  const { t } = useT();
  const navigate = useNavigate();
  const { postcode, setPostcode } = useDelivery();

  // The URL carries the choice (`?postcode=10115`, so a shared link shows the same shop); the
  // delivery context reads it, remembers it and asks the API what it means.
  const submit = (code: string) => {
    setPostcode(code);
    navigate(`/?postcode=${code}`);
  };

  return (
    <section
      aria-labelledby="home-hero-heading"
      data-testid="home-hero"
      className="bg-primary-soft"
    >
      <Container className="grid items-center gap-6 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:gap-10 md:py-12">
        <div className="min-w-0">
          <p className="inline-flex rounded-full bg-accent px-3 py-1 text-sm font-bold text-ink">
            {t('shell.home.hero.eyebrow')}
          </p>
          <h1
            id="home-hero-heading"
            className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl"
          >
            {t('shell.home.h1')}
          </h1>
          <p className="mt-3 max-w-prose text-lg text-ink">{t('shell.home.hero.lead')}</p>
          <PostcodeForm
            initial={postcode ?? ''}
            onSubmit={submit}
            className="mt-5 flex max-w-md flex-col gap-3 sm:flex-row sm:items-start"
          />
          <DeliveryResult />
        </div>
        <ul aria-hidden="true" className="hidden grid-cols-3 gap-3 md:grid">
          {DEPARTMENTS.slice(0, 9).map((dept) => (
            <li
              key={dept.slug}
              data-dept={dept.slug}
              className="flex aspect-square items-center justify-center rounded-card bg-dept-accent text-ink"
            >
              <DepartmentGlyph icon={dept.icon} width={34} height={34} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
