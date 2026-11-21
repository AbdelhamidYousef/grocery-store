import { lookupFor, type TFunction, type TnFunction } from '../../i18n';

// Display helpers for review data. Everything arrives as integers (tenths of a star) and is formatted here, with integer arithmetic only, so 46 is always "4.6".

export const formatRating = (tenths: number): string =>
  `${Math.floor(tenths / 10)}.${String(tenths % 10)}`;

// The text helpers take the shopper's words and locale. Without them they speak the default
// English, so the admin screens (English only) and the unit tests call them as before.
export interface ReviewWords {
  t: TFunction;
  tn: TnFunction;
  locale: string;
}
const english = lookupFor('en-IE');
const ENGLISH: ReviewWords = {
  t: (key, params) => english.t(key, params),
  tn: (key, count, params) => english.tn(key, count, params),
  locale: 'en-IE',
};

/** "Bought size M" line from whatever the reviewer shared, or nothing. */
export function reviewContextLine(
  r: { sizePurchased: string | null },
  words: ReviewWords = ENGLISH,
): string | null {
  return r.sizePurchased ? words.t('reviews.size', { size: r.sizePurchased }) : null;
}

// ---------- URL state: ?rsort= &rstar= &rtopic= &rpage= ----------

export interface ReviewView {
  sort: 'helpful' | 'newest' | 'photos';
  rating: number | undefined;
  topic: string | undefined;
  page: number;
}

const SORTS = ['helpful', 'newest', 'photos'] as const;

export function viewFromSearch(sp: URLSearchParams): ReviewView {
  const sort = SORTS.find((s) => s === sp.get('rsort')) ?? 'helpful';
  const star = Number(sp.get('rstar'));
  const page = Number(sp.get('rpage'));
  return {
    sort,
    rating: Number.isInteger(star) && star >= 1 && star <= 5 ? star : undefined,
    topic: sp.get('rtopic')?.slice(0, 40) || undefined,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Returns a copy of `sp` with the given review params changed (undefined removes one). */
export function withView(sp: URLSearchParams, change: Partial<ReviewView>): URLSearchParams {
  const next = new URLSearchParams(sp);
  const set = (key: string, value: string | undefined) =>
    value === undefined ? next.delete(key) : next.set(key, value);
  // Any filter change goes back to page 1: page 4 of a narrower list may not exist.
  const filterChanged = 'sort' in change || 'rating' in change || 'topic' in change;
  if ('sort' in change) set('rsort', change.sort === 'helpful' ? undefined : change.sort);
  if ('rating' in change) set('rstar', change.rating?.toString());
  if ('topic' in change) set('rtopic', change.topic);
  if ('page' in change || filterChanged) {
    const page = filterChanged ? 1 : (change.page ?? 1);
    set('rpage', page > 1 ? String(page) : undefined);
  }
  return next;
}
