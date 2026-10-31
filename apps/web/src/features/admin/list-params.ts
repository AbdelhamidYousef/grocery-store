import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { z } from 'zod';

// Admin lists keep their state (search text, status filter, page) in the URL, like the storefront
// lists do: a filtered view can be bookmarked or sent to a colleague, Back undoes the last filter,
// and a reload keeps the place. A hand-edited bad value falls back to the default instead of
// breaking the page.

export const ADMIN_PAGE_SIZE = 20;

export interface AdminListState<S extends string> {
  q: string;
  status: S | undefined;
  page: number;
}

export function parseAdminList<S extends string>(
  search: URLSearchParams,
  statusSchema: z.ZodType<S>,
): AdminListState<S> {
  const page = Number(search.get('page'));
  const status = statusSchema.safeParse(search.get('status'));
  return {
    q: (search.get('q') ?? '').trim().slice(0, 100),
    status: status.success ? status.data : undefined,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

function toSearch<S extends string>(state: AdminListState<S>): URLSearchParams {
  const next = new URLSearchParams();
  if (state.q) next.set('q', state.q);
  if (state.status) next.set('status', state.status);
  if (state.page > 1) next.set('page', String(state.page));
  return next;
}

export function useAdminList<S extends string>(statusSchema: z.ZodType<S>) {
  const [search, setSearch] = useSearchParams();
  const key = search.toString();
  // Re-parse only when the URL text changes, so `state` is a stable object between renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => parseAdminList(search, statusSchema), [key, statusSchema]);

  // Changing the search or the filter resets to page 1: page 3 of the old result means nothing in
  // the new one. Only an explicit `page` keeps its number.
  const update = useCallback(
    (patch: Partial<AdminListState<S>>) => {
      setSearch((current) => {
        const before = parseAdminList(current, statusSchema);
        return toSearch({ ...before, page: 1, ...patch });
      });
    },
    [setSearch, statusSchema],
  );

  const hrefFor = useCallback(
    (page: number) => {
      const text = toSearch({ ...state, page }).toString();
      return text ? `?${text}` : '?';
    },
    [state],
  );

  return { state, update, hrefFor };
}
