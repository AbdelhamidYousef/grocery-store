import type { GuideDetail } from '@store/shared';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { Breadcrumbs } from '../components/layout/Breadcrumbs';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ProductGrid } from '../features/catalog/ProductGrid';
import { GuideCard } from '../features/guides/GuideCard';
import { MarkdownBody } from '../features/guides/MarkdownBody';
import { useGuide } from '../features/guides/queries';
import { useCanonicalSlug } from '../features/stores/useCanonicalSlug';
import { useT } from '../i18n';
import { useFormat } from '../i18n/format';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

import NotFoundPage from './NotFoundPage';

export default function GuidePage() {
  const { slug } = useParams();
  const { t } = useT();
  const { data: guide, error, isPending, refetch } = useGuide(slug);
  useCanonicalSlug('guides', slug, guide?.slug);

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="guide" />;
  if (error) {
    return (
      <Container className="py-12 text-center" data-testid={TEST_IDS.pageGuide}>
        <Seo title={t('content.guides.errorTitle')} noindex />
        <h1 className="text-3xl font-bold">{t('content.guides.loadError')}</h1>
        <Button className="mt-4" onClick={() => void refetch()}>
          {t('content.guides.retry')}
        </Button>
      </Container>
    );
  }
  if (isPending) {
    return (
      <Container className="py-8" data-testid={TEST_IDS.pageGuide} aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 h-64 w-full max-w-prose" />
      </Container>
    );
  }
  return <GuideView guide={guide} />;
}

function GuideView({ guide }: { guide: GuideDetail }) {
  const { t } = useT();
  const fmt = useFormat();
  const date = new Intl.DateTimeFormat(fmt.locale, { dateStyle: 'long', timeZone: 'UTC' });
  useEffect(() => {
    track({ name: 'view_guide', slug: guide.slug, category: guide.category.slug });
  }, [guide.slug, guide.category.slug]);

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageGuide}>
      <Seo
        title={guide.title}
        description={guide.summary}
        type="article"
        publishedAt={guide.publishedAt}
        {...(guide.coverUrl && { image: guide.coverUrl })}
      />
      <Breadcrumbs
        items={[
          { label: t('content.guides.home'), to: '/' },
          { label: t('content.guides.guides'), to: '/guides' },
          { label: guide.category.name, to: `/guides?category=${guide.category.slug}` },
          { label: guide.title },
        ]}
      />
      <article className="mt-4">
        <header>
          <h1 className="font-display text-3xl font-bold leading-tight break-words sm:text-4xl">
            {guide.title}
          </h1>
          <p className="mt-2 text-muted">
            {date.format(new Date(guide.publishedAt))} &middot;{' '}
            {t('content.guides.minRead', { minutes: guide.readingMinutes })}
          </p>
        </header>
        {guide.coverUrl && (
          <img
            src={guide.coverUrl}
            alt=""
            className="mt-4 aspect-[16/9] w-full max-w-prose rounded-card object-cover"
          />
        )}
        <div className="mt-6" data-testid={TEST_IDS.guideBody}>
          <MarkdownBody source={guide.bodyMd} />
        </div>
      </article>

      {guide.products.length > 0 && (
        <section className="mt-12" aria-labelledby="guide-products-heading">
          <h2 id="guide-products-heading" className="font-display text-2xl font-bold">
            {t('content.guides.products')}
          </h2>
          <div className="mt-4" data-testid={TEST_IDS.guideProducts}>
            <ProductGrid products={guide.products} listId={`guide-${guide.slug}`} />
          </div>
        </section>
      )}

      {guide.related.length > 0 && (
        <section className="mt-12" aria-labelledby="guide-related-heading">
          <h2 id="guide-related-heading" className="font-display text-2xl font-bold">
            {t('content.guides.more')}
          </h2>
          <ul
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid={TEST_IDS.guideRelated}
          >
            {guide.related.map((g) => (
              <GuideCard key={g.slug} guide={g} />
            ))}
          </ul>
          <p className="mt-4">
            <Link to="/guides" className="font-semibold text-primary-strong underline">
              {t('content.guides.all')}
            </Link>
          </p>
        </section>
      )}
    </Container>
  );
}
