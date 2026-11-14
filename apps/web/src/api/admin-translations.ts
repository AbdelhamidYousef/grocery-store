import {
  EntityTranslationsResponseSchema,
  MissingReportResponseSchema,
  type TranslationEntity,
  type TranslationInput,
  type TranslationLocale,
} from '@store/shared';

import { apiFetch } from './client';

// Back-office calls for catalogue translations (admin only).
export async function fetchEntityTranslations(
  entity: TranslationEntity,
  id: string,
  signal?: AbortSignal,
) {
  return (
    await apiFetch(`/admin/translations/${entity}/${encodeURIComponent(id)}`, {
      schema: EntityTranslationsResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}

export async function saveEntityTranslation(
  entity: TranslationEntity,
  id: string,
  locale: TranslationLocale,
  input: TranslationInput,
) {
  return (
    await apiFetch(`/admin/translations/${entity}/${encodeURIComponent(id)}/${locale}`, {
      method: 'PUT',
      body: input,
      schema: EntityTranslationsResponseSchema,
    })
  ).data;
}

export async function fetchMissingTranslations(locale: TranslationLocale, signal?: AbortSignal) {
  return (
    await apiFetch(`/admin/translations/missing?locale=${locale}`, {
      schema: MissingReportResponseSchema,
      ...(signal && { signal }),
    })
  ).data;
}
