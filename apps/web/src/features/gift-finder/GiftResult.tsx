import {
  GIFT_QUESTIONS,
  GOAL_LABELS,
  formatMoney,
  giftSearch,
  parseGiftAnswers,
  scoreGifts,
  type GiftAnswers,
} from '@store/shared';
import { useMemo } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { Button, buttonClasses } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ProductCard } from '../catalog/ProductCard';

import { useGiftCandidates } from './queries';

const petWord = (a: GiftAnswers) =>
  GIFT_QUESTIONS[0]?.options.find((o) => o.value === a.pet)?.label.replace(/^An? /, '') ?? 'a pet';

function relaxedNote(answers: GiftAnswers, relaxed: string[]): string | null {
  if (relaxed.length === 0) return null;
  const parts: string[] = [];
  if (relaxed.includes('budget')) {
    parts.push(
      answers.budget > 0
        ? `nothing matched up to ${formatMoney(answers.budget, 'EUR')}, so we widened the budget`
        : 'we widened the budget',
    );
  }
  if (relaxed.includes('age')) parts.push('we also stopped filtering by age');
  if (relaxed.includes('goal')) {
    parts.push(`nothing matched ${GOAL_LABELS[answers.goal]}, so these are the best of the rest`);
  }
  const text = parts.join(', and ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// The result is a pure function of the URL and the catalogue: the same link shows the same picks.
// A URL that does not hold four valid answers goes back to the quiz.
export function GiftResult() {
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  const toast = useToast();
  const searchText = search.toString();
  const { complete, partial } = useMemo(
    () => parseGiftAnswers(new URLSearchParams(searchText)),
    [searchText],
  );
  const { data, isPending, isError, refetch } = useGiftCandidates(complete?.pet ?? 'any');
  const result = useMemo(
    () => (complete && data ? scoreGifts(data, complete) : null),
    [data, complete],
  );

  if (!complete) return <Navigate to={`/gift-finder?${giftSearch(partial)}`} replace />;

  const copy = async () => {
    try {
      // The router's own path and query, not window.location: the same under any history type.
      await navigator.clipboard.writeText(
        `${window.location.origin}${pathname}?${search.toString()}`,
      );
      toast.show('Link copied', 'success');
    } catch {
      toast.show('Copy the address from your browser to share these ideas.', 'info');
    }
  };

  const refine = new URLSearchParams(giftSearch(complete));
  refine.set('step', '1');
  const note = result ? relaxedNote(complete, result.relaxed) : null;

  return (
    <Container className="py-8" data-testid="page-gift-result">
      <Seo title="Gift ideas" noindex />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">
        Gift ideas for {petWord(complete)}
      </h1>
      <p className="mt-2 text-muted" data-testid="gift-summary">
        {GOAL_LABELS[complete.goal].replace(/^./, (c) => c.toUpperCase())}
        {complete.budget > 0 ? `, up to ${formatMoney(complete.budget, 'EUR')}` : ', any budget'}
        {complete.age !== 'any'
          ? `, ${complete.age === 'young' ? 'a young one' : `a ${complete.age} one`}`
          : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to={`/gift-finder?${refine.toString()}`} className={buttonClasses('secondary')}>
          Change my answers
        </Link>
        <Button variant="secondary" onClick={() => void copy()} data-testid="gift-copy">
          Copy link
        </Button>
      </div>

      {isPending && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3" aria-busy="true">
          <p className="sr-only" role="status">
            Finding gift ideas
          </p>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-card" />
          ))}
        </div>
      )}
      {isError && (
        <div role="alert" className="mt-6 rounded-card bg-danger-soft p-6 text-danger">
          <p className="font-bold">We could not load gift ideas.</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {note && (
        <p
          role="status"
          className="mt-6 rounded-card bg-primary-soft p-4 font-semibold"
          data-testid="gift-relaxed"
        >
          {note}
        </p>
      )}
      {result &&
        (result.picks.length === 0 ? (
          <p className="mt-6 text-muted" data-testid="empty-state">
            We have nothing in stock for that pet right now.{' '}
            <Link to="/" className="font-semibold text-primary-strong underline">
              Back to the shop
            </Link>
          </p>
        ) : (
          <ul
            className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3"
            data-testid="gift-picks"
          >
            {result.picks.map((pick, i) => (
              <ProductCard
                key={pick.card.id}
                product={pick.card}
                priority={i < 3}
                footer={
                  <p className="px-1 pt-2 text-sm text-muted" data-testid="gift-why">
                    {pick.why}
                  </p>
                }
              />
            ))}
          </ul>
        ))}
    </Container>
  );
}
