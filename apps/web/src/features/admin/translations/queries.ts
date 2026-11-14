import type { TranslationEntity, TranslationInput, TranslationLocale } from '@store/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchEntityTranslations,
  fetchMissingTranslations,
  saveEntityTranslation,
} from '../../../api/admin-translations';

const STALE = 0;
const root = ['admin', 'translations'] as const;

export function useEntityTranslations(entity: TranslationEntity, id: string) {
  return useQuery({
    queryKey: [...root, entity, id],
    queryFn: ({ signal }) => fetchEntityTranslations(entity, id, signal),
    staleTime: STALE,
  });
}

export function useMissingTranslations(locale: TranslationLocale) {
  return useQuery({
    queryKey: [...root, 'missing', locale],
    queryFn: ({ signal }) => fetchMissingTranslations(locale, signal),
    staleTime: STALE,
  });
}

export function useSaveTranslation(entity: TranslationEntity, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { locale: TranslationLocale; input: TranslationInput }) =>
      saveEntityTranslation(entity, id, vars.locale, vars.input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: root });
      // Shoppers see the new words when they next look (public catalogue caches).
      await client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
