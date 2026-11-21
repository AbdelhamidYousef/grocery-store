import { DEPARTMENTS } from '@store/shared';
import { Link } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { departmentName } from '../features/navigation/department-names';
import { useT, type StringKey } from '../i18n';

type What = 'page' | 'product' | 'category' | 'brand' | 'collection' | 'guide';

// The title and heading are whole sentences per kind of thing, so a language can inflect them.
const TITLE: Record<What, StringKey> = {
  page: 'shell.notFound.titlePage',
  product: 'shell.notFound.titleProduct',
  category: 'shell.notFound.titleCategory',
  brand: 'shell.notFound.titleBrand',
  collection: 'shell.notFound.titleCollection',
  guide: 'shell.notFound.titleGuide',
};
const HEADING: Record<What, StringKey> = {
  page: 'shell.notFound.headingPage',
  product: 'shell.notFound.headingProduct',
  category: 'shell.notFound.headingCategory',
  brand: 'shell.notFound.headingBrand',
  collection: 'shell.notFound.headingCollection',
  guide: 'shell.notFound.headingGuide',
};

// One 404 for every kind of missing thing; `what` only changes the wording. A dead end is the
// worst place to leave a shopper, so the page also lists the way back into the catalogue.
export default function NotFoundPage({ what = 'page' }: { what?: What }) {
  const { t } = useT();
  return (
    <Container className="py-16 text-center" data-testid="page-not-found">
      <Seo title={t(TITLE[what])} noindex />
      <p className="font-display text-6xl font-bold text-primary-strong" aria-hidden="true">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold">{t(HEADING[what])}</h1>
      <p className="mt-3 text-muted">
        {what === 'product' ? t('shell.notFound.productHint') : t('shell.notFound.pageHint')}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-control bg-primary px-5 font-display font-semibold text-surface hover:bg-primary-hover"
      >
        {t('shell.notFound.back')}
      </Link>
      <p className="mt-8 text-sm font-semibold text-muted">{t('shell.notFound.orLookAt')}</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {DEPARTMENTS.map((dept) => (
          <li key={dept.slug} data-dept={dept.slug}>
            <Link
              to={`/c/${dept.slug}`}
              className="inline-flex min-h-11 items-center rounded-full bg-dept-soft px-4 font-display font-semibold text-dept-strong"
            >
              {departmentName(t, dept)}
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
