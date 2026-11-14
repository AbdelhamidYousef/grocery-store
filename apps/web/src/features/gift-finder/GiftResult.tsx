import { giftSearch, parseGiftAnswers, scoreGifts, type GiftAnswers } from '@store/shared';
import { useMemo } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { Button, buttonClasses } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useT, type TFunction } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { ProductCard } from '../catalog/ProductCard';
import { useStorePath } from '../stores/StoreContext';

import { GOAL_KEYS, PET_WORD_KEYS } from './labels';
import { useGiftCandidates } from './queries';

type Fmt = ReturnType<typeof useFormat>;

const petWord = (a: GiftAnswers, t: TFunction) => {
  const key = PET_WORD_KEYS[a.pet];
  return key ? t(key) : t('pets.gift.petWord.fallback');
};

const goalWord = (a: GiftAnswers, t: TFunction) => t(GOAL_KEYS[a.goal] ?? 'pets.gift.goal.play');

function relaxedNote(
  answers: GiftAnswers,
  relaxed: string[],
  t: TFunction,
  fmt: Fmt,
): string | null {
  if (relaxed.length === 0) return null;
  const parts: string[] = [];
  if (relaxed.includes('budget')) {
    parts.push(
      answers.budget > 0
        ? t('pets.gift.relaxed.budget', { amount: fmt.money(answers.budget) })
        : t('pets.gift.relaxed.budgetAny'),
    );
  }
  if (relaxed.includes('age')) parts.push(t('pets.gift.relaxed.age'));
  if (relaxed.includes('goal')) {
    parts.push(t('pets.gift.relaxed.goal', { goal: goalWord(answers, t) }));
  }
  const text = parts.join(t('pets.gift.relaxed.join'));
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// The result is a pure function of the URL and the catalogue: the same link shows the same picks.
// A URL that does not hold four valid answers goes back to the quiz.
export function GiftResult() {
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  const toast = useToast();
  const { t } = useT();
  const storePath = useStorePath();
  const fmt = useFormat();
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
        `${window.location.origin}${storePath(pathname)}?${search.toString()}`,
      );
      toast.show(t('pets.gift.linkCopied'), 'success');
    } catch {
      toast.show(t('pets.gift.copyFailed'), 'info');
    }
  };

  const refine = new URLSearchParams(giftSearch(complete));
  refine.set('step', '1');
  const note = result ? relaxedNote(complete, result.relaxed, t, fmt) : null;

  return (
    <Container className="py-8" data-testid="page-gift-result">
      <Seo title={t('pets.gift.resultTitle')} noindex />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">
        {t('pets.gift.resultHeading', { pet: petWord(complete, t) })}
      </h1>
      <p className="mt-2 text-muted" data-testid="gift-summary">
        {goalWord(complete, t).replace(/^./, (c) => c.toUpperCase())}
        {complete.budget > 0
          ? t('pets.gift.summary.budget', { amount: fmt.money(complete.budget) })
          : t('pets.gift.summary.anyBudget')}
        {complete.age !== 'any' ? t(`pets.gift.summary.age.${complete.age}`) : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to={`/gift-finder?${refine.toString()}`} className={buttonClasses('secondary')}>
          {t('pets.gift.change')}
        </Link>
        <Button variant="secondary" onClick={() => void copy()} data-testid="gift-copy">
          {t('pets.gift.copy')}
        </Button>
      </div>

      {isPending && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3" aria-busy="true">
          <p className="sr-only" role="status">
            {t('pets.gift.finding')}
          </p>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-card" />
          ))}
        </div>
      )}
      {isError && (
        <div role="alert" className="mt-6 rounded-card bg-danger-soft p-6 text-danger">
          <p className="font-bold">{t('pets.gift.error')}</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            {t('pets.gift.retry')}
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
            {t('pets.gift.empty')}{' '}
            <Link to="/" className="font-semibold text-primary-strong underline">
              {t('pets.gift.backToShop')}
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
