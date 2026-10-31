import { ProductListQuerySchema, type ProductListQuery, type ProductSort } from '@store/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// All list state (sort, page, price, stock, attribute filters) lives in the URL, not in React
// state: a filtered list is shareable and bookmarkable, Back undoes the last filter, a reload
// keeps your place, and a later prerender can read the same URL. This file is the only code that
// converts between the URL and the typed values the UI uses.

export const PAGE_SIZE = 24;

// Parameters the filter UI owns. Anything else in the URL (`q`) is left alone when we write.
const OWNED = ['sort', 'page', 'minPrice', 'maxPrice', 'inStock'] as const;
const ATTR_PREFIX = 'attr.';

/**
 * Parses the URL with the shared query schema (the same one the API validates with). A hand-edited
 * URL can be invalid (`?page=abc`); instead of an error page we drop the offending keys and use
 * the defaults, so a bad link still shows a list.
 */
export function parseListParams(search: URLSearchParams): ProductListQuery {
  const raw: Record<string, string> = {};
  for (const [key, value] of search) raw[key] = value;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = ProductListQuerySchema.safeParse(raw);
    if (result.success) return result.data;
    const bad = new Set(result.error.issues.map((i) => String(i.path[0] ?? '')));
    let removed = false;
    for (const key of Object.keys(raw)) {
      const root = key.startsWith(ATTR_PREFIX) ? 'attr' : key;
      if (bad.has(root) && delete raw[key]) removed = true;
    }
    // A cross-field issue (min > max) reports at `minPrice`; if nothing matched, give up safely.
    if (!removed) break;
  }
  return ProductListQuerySchema.parse({});
}

export interface ListPatch {
  sort?: ProductSort | undefined;
  page?: number | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  inStock?: boolean | undefined;
  /** key -> selected values; an empty array removes the filter. */
  attr?: Record<string, string[]> | undefined;
}

/**
 * Returns new search params with `patch` applied. A key present in the patch with value
 * `undefined` is removed. Any change except an explicit `page` resets to page 1, because page 3 of
 * the old result set means nothing in the new one.
 */
export function applyListPatch(current: URLSearchParams, patch: ListPatch): URLSearchParams {
  const next = new URLSearchParams(current);

  for (const key of OWNED) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined || value === false || (key === 'page' && value === 1)) next.delete(key);
    else next.set(key, String(value));
  }
  for (const [key, values] of Object.entries(patch.attr ?? {})) {
    if (values.length === 0) next.delete(`${ATTR_PREFIX}${key}`);
    else next.set(`${ATTR_PREFIX}${key}`, values.join(','));
  }
  if (!('page' in patch)) next.delete('page');
  return next;
}

export function clearedFilters(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  const q = current.get('q');
  if (q) next.set('q', q);
  return next;
}

export function hasActiveFilters(query: ProductListQuery): boolean {
  return (
    query.minPrice !== undefined ||
    query.maxPrice !== undefined ||
    query.inStock === true ||
    Object.keys(query.attr).length > 0
  );
}

export function useProductListParams() {
  const [search, setSearch] = useSearchParams();
  const key = search.toString();
  // Re-parse only when the URL text changes, so `query` is a stable object between renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(() => parseListParams(search), [key]);

  const update = useCallback(
    (patch: ListPatch) => {
      // Filtering must not throw the shopper back to the top of the page (see ListingPage, which
      // scrolls up itself when the page number changes).
      setSearch((current) => applyListPatch(current, patch), { preventScrollReset: true });
    },
    [setSearch],
  );
  const clear = useCallback(() => {
    setSearch((current) => clearedFilters(current), { preventScrollReset: true });
  }, [setSearch]);

  return { query, search, update, clear };
}
