import { DEPARTMENTS } from '@store/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { DepartmentGlyph } from '../../components/icons';
import { Container } from '../../components/layout/Container';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useT } from '../../i18n';

// Berlin postcodes are five digits. The box only checks the shape and writes `?postcode=`; looking
// the area up (and showing slots) arrives with the delivery phase.
const POSTCODE = /^\d{5}$/;

// The first screen: the promise, one box that starts the order, and a quiet picture made of the
// department icons (decoration only, so it is hidden from screen readers and from small phones).
export function HomeHero() {
  const { t } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const saved = params.get('postcode') ?? '';
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const postcode = value.trim();
    if (!POSTCODE.test(postcode)) {
      setError(t('shell.home.hero.postcodeInvalid'));
      return;
    }
    setError(undefined);
    navigate(`/?postcode=${postcode}`);
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
          <form
            onSubmit={submit}
            noValidate
            data-testid="postcode-form"
            className="mt-5 flex max-w-md flex-col gap-3 sm:flex-row sm:items-start"
          >
            <div className="min-w-0 flex-1">
              <Input
                label={t('shell.home.hero.postcodeLabel')}
                hint={t('shell.home.hero.postcodeHint')}
                error={error}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button type="submit" className="sm:mt-7">
              {t('shell.home.hero.postcodeButton')}
            </Button>
          </form>
          {saved && POSTCODE.test(saved) && (
            <p role="status" data-testid="postcode-saved" className="mt-3 font-semibold text-ink">
              {t('shell.home.hero.postcodeSaved', { postcode: saved })}
            </p>
          )}
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
