import type { ProductDetail } from '@store/shared';
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { loginUrl } from '../../lib/safe-next';
import { TEST_IDS } from '../../lib/test-ids';
import { useAuth } from '../auth/AuthProvider';
import { Pagination } from '../catalog/Pagination';

import { viewFromSearch, withView } from './format';
import { useReviews } from './queries';
import { RatingStars } from './RatingStars';
import { RecommendBadge } from './RecommendBadge';
import { ReviewCard } from './ReviewCard';
import { ReviewForm } from './ReviewForm';
import { StarBreakdown } from './StarBreakdown';
import { TopicChips } from './TopicChips';

// Sort, star filter, topic filter and page all live in the URL (?rsort=&rstar=&rtopic=&rpage=), so
// a link to "1-star reviews that mention the zip" can be shared and Back works. `replace`: a
// filter click is exploring, not navigating. All data comes through `useReviews` (no fetches here).
export function ReviewsSection({ product }: { product: ProductDetail }) {
  const { t, tn } = useT();
  const fmt = useFormat();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { status } = useAuth();
  const [writing, setWriting] = useState(false);
  const view = viewFromSearch(params);
  const { data, isPending, isError, refetch, isPlaceholderData } = useReviews(product.slug, {
    sort: view.sort,
    rating: view.rating,
    topic: view.topic,
    page: view.page,
  });

  const change = (next: Parameters<typeof withView>[1]) =>
    setParams(withView(params, next), { replace: true, preventScrollReset: true });
  const hrefFor = (page: number) => {
    const next = withView(params, { page });
    const qs = next.toString();
    return `${location.pathname}${qs ? `?${qs}` : ''}#reviews`;
  };

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      data-testid={TEST_IDS.reviewsSection}
      className="mt-12 scroll-mt-24"
    >
      <h2 id="reviews-heading" className="font-display text-2xl font-bold">
        {t('reviews.heading')}
      </h2>

      {isError && (
        <div className="mt-4">
          <p>{t('reviews.loadError')}</p>
          <Button className="mt-2" onClick={() => void refetch()}>
            {t('reviews.retry')}
          </Button>
        </div>
      )}
      {isPending && <Skeleton className="mt-4 h-40 w-full" />}

      {data && (
        <>
          {data.summary.rating.count === 0 ? (
            <p className="mt-3 text-muted">{t('reviews.none')}</p>
          ) : (
            <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-5xl font-bold">
                    {fmt.number(data.summary.rating.averageTenths / 10, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </span>
                  <span className="text-muted">{t('reviews.outOf5')}</span>
                </p>
                <RatingStars tenths={data.summary.rating.averageTenths} size="lg" />
                <p className="text-sm text-muted">
                  {tn('reviews.count', data.summary.rating.count)}
                </p>
                <RecommendBadge percent={data.summary.recommendPercent} />
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <StarBreakdown
                  breakdown={data.summary.breakdown}
                  active={view.rating}
                  onPick={(rating) => change({ rating })}
                />
                <TopicChips
                  topics={data.summary.topics}
                  active={view.topic}
                  onPick={(topic) => change({ topic })}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-56" data-testid={TEST_IDS.reviewSort}>
              <Select
                label={t('reviews.sort.label')}
                value={view.sort}
                onChange={(e) => change({ sort: viewFromSearchSort(e.target.value) })}
              >
                <option value="helpful">{t('reviews.sort.helpful')}</option>
                <option value="newest">{t('reviews.sort.newest')}</option>
                <option value="photos">{t('reviews.sort.photos')}</option>
              </Select>
            </div>
            {(view.rating !== undefined || view.topic !== undefined) && (
              <Button
                variant="ghost"
                onClick={() => change({ rating: undefined, topic: undefined })}
              >
                {t('reviews.clearFilters')}
              </Button>
            )}
          </div>

          {data.data.length === 0 && data.summary.rating.count > 0 && (
            <p className="mt-6 text-muted">{t('reviews.noMatch')}</p>
          )}
          <ul aria-busy={isPlaceholderData} className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.data.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </ul>
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} hrefFor={hrefFor} />

          <div className="mt-8">
            {status === 'authenticated' ? (
              writing ? (
                <ReviewForm
                  slug={product.slug}
                  productId={product.id}
                  productName={product.name}
                  uploadsEnabled={data.summary.uploadsEnabled}
                />
              ) : (
                <Button onClick={() => setWriting(true)}>{t('reviews.write')}</Button>
              )
            ) : (
              <p>
                <Link
                  to={loginUrl(`${location.pathname}${location.search}#reviews`)}
                  className="font-semibold underline"
                >
                  {t('reviews.signIn')}
                </Link>{' '}
                {t('reviews.signInToWrite')}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function viewFromSearchSort(value: string): 'helpful' | 'newest' | 'photos' {
  return value === 'newest' || value === 'photos' ? value : 'helpful';
}
