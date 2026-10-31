import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  fetchGuide,
  fetchGuideCategories,
  fetchGuides,
  type GuideListParams,
} from '../../api/guides';
import { keys } from '../../lib/query-client';

export function useGuides(params: GuideListParams) {
  return useQuery({
    queryKey: keys.guides.list(params),
    queryFn: ({ signal }) => fetchGuides(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useGuide(slug: string | undefined) {
  return useQuery({
    queryKey: keys.guides.detail(slug ?? ''),
    queryFn: ({ signal }) => fetchGuide(slug ?? '', signal),
    enabled: !!slug,
  });
}

export function useGuideCategories() {
  return useQuery({
    queryKey: keys.guides.categories,
    queryFn: ({ signal }) => fetchGuideCategories(signal),
  });
}
