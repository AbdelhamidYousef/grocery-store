// Display helpers for review data. Everything arrives as integers (tenths of a star) and is formatted here, with integer arithmetic only, so 46 is always "4.6".

export const formatRating = (tenths: number): string =>
  `${Math.floor(tenths / 10)}.${String(tenths % 10)}`;

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
