import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { Breadcrumbs } from '../components/layout/Breadcrumbs';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useBrands } from '../features/merchandising/queries';
import { useT } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

export default function BrandsPage() {
  const { t, tn } = useT();
  const { data: brands, isPending, isError, refetch } = useBrands();

  useEffect(() => {
    track({ name: 'view_brands' });
  }, []);

  return (
    <Container className="py-6" data-testid={TEST_IDS.pageBrands}>
      <Seo
        title={t('catalog.page.brands')}
        description={t('catalog.brands.description')}
        canonical="/brands"
      />
      <Breadcrumbs
        items={[{ label: t('catalog.page.home'), to: '/' }, { label: t('catalog.page.brands') }]}
      />
      <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
        {t('catalog.brands.title')}
      </h1>
      <p className="mt-2 max-w-prose text-muted">{t('catalog.brands.intro')}</p>
      {isError ? (
        <div role="alert" className="mt-6 rounded-card bg-danger-soft p-6 text-danger">
          <p className="font-bold">{t('catalog.brands.loadError')}</p>
          <Button className="mt-4" onClick={() => void refetch()}>
            {t('catalog.page.tryAgain')}
          </Button>
        </div>
      ) : isPending ? (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-36 w-full rounded-card" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <li key={brand.id} className="min-w-0">
              <Link
                to={`/brands/${brand.slug}`}
                data-testid={TEST_IDS.brandCard}
                className="flex h-full flex-col gap-2 rounded-card border-l-8 bg-surface p-5 shadow-card transition-transform hover:-translate-y-0.5"
                style={{ borderLeftColor: brand.accentColor }}
              >
                <span className="break-words font-display text-xl font-bold">{brand.name}</span>
                <span className="text-muted">{brand.tagline}</span>
                <span className="mt-auto text-sm font-semibold text-primary-strong">
                  {tn('catalog.productCount', brand.productCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
