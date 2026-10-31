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
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

import NotFoundPage from './NotFoundPage';

export default function GuidePage() {
  const { slug } = useParams();
  const { data: guide, error, isPending, refetch } = useGuide(slug);

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="guide" />;
  if (error) {
    return (
      <Container className="py-12 text-center" data-testid={TEST_IDS.pageGuide}>
        <Seo title="Something went wrong" noindex />
        <h1 className="text-3xl font-bold">We could not load this guide</h1>
        <Button className="mt-4" onClick={() => void refetch()}>
          Try again
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

const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' });

function GuideView({ guide }: { guide: GuideDetail }) {
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
          { label: 'Home', to: '/' },
          { label: 'Guides', to: '/guides' },
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
            {DATE.format(new Date(guide.publishedAt))} &middot; {guide.readingMinutes} min read
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
            Products mentioned in this guide
          </h2>
          <div className="mt-4" data-testid={TEST_IDS.guideProducts}>
            <ProductGrid products={guide.products} listId={`guide-${guide.slug}`} />
          </div>
        </section>
      )}

      {guide.related.length > 0 && (
        <section className="mt-12" aria-labelledby="guide-related-heading">
          <h2 id="guide-related-heading" className="font-display text-2xl font-bold">
            More guides
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
              All guides
            </Link>
          </p>
        </section>
      )}
    </Container>
  );
}
