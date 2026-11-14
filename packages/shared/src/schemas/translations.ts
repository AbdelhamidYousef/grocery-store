import { z } from 'zod';

import { IdParamsSchema } from './account.ts';
import { DataSchema } from './common.ts';
import { SLUG_PATTERN } from './merchandising.ts';

// Catalogue translations (admin). English lives in the base columns; a translation is a row per
// (entity, language) whose every field is optional: an empty or missing field means "show the
// English one".

export const TRANSLATION_ENTITIES = [
  'product',
  'category',
  'brand',
  'collection',
  'guide',
] as const;
export const TranslationEntitySchema = z.enum(TRANSLATION_ENTITIES);
export type TranslationEntity = (typeof TRANSLATION_ENTITIES)[number];

/** Languages with a translation table row (English is the base columns). */
export const TRANSLATION_LOCALES = ['de'] as const;
export const TranslationLocaleSchema = z.enum(TRANSLATION_LOCALES);
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

/** Which fields each entity can translate (besides slug and the two meta fields on all of them). */
export const TRANSLATION_FIELDS: Record<TranslationEntity, readonly string[]> = {
  product: ['name', 'description'],
  category: ['name', 'description'],
  brand: ['name', 'tagline', 'story'],
  collection: ['name', 'description'],
  guide: ['title', 'summary', 'bodyMd'],
};
export const TRANSLATION_COMMON_FIELDS = ['slug', 'metaTitle', 'metaDescription'] as const;

export const TranslationParamsSchema = z.object({
  entity: TranslationEntitySchema,
  id: IdParamsSchema.shape.id,
});
export const TranslationLocaleParamsSchema = TranslationParamsSchema.extend({
  locale: TranslationLocaleSchema,
});

const Text = z.string().max(20000).nullable().optional();
export const TranslationInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .max(80)
      .regex(SLUG_PATTERN, 'Lower-case letters, digits and dashes')
      .nullable()
      .optional(),
    name: Text,
    description: Text,
    tagline: Text,
    story: Text,
    title: Text,
    summary: Text,
    bodyMd: Text,
    metaTitle: z.string().max(200).nullable().optional(),
    metaDescription: z.string().max(400).nullable().optional(),
  })
  .strict();
export type TranslationInput = z.infer<typeof TranslationInputSchema>;

const FieldMap = z.record(z.string(), z.string().nullable());
export const EntityTranslationsSchema = z.object({
  entity: TranslationEntitySchema,
  id: z.string(),
  /** The English source (base columns), by field. */
  english: FieldMap,
  /** One entry per language; null when no row exists yet. */
  locales: z.object({ de: FieldMap.nullable() }),
});
export type EntityTranslations = z.infer<typeof EntityTranslationsSchema>;
export const EntityTranslationsResponseSchema = DataSchema(EntityTranslationsSchema);

export const MissingQuerySchema = z.object({ locale: TranslationLocaleSchema });
export const MissingReportSchema = z.object({
  locale: TranslationLocaleSchema,
  entities: z.array(
    z.object({
      entity: TranslationEntitySchema,
      total: z.number().int(),
      /** Entities whose every translatable field has text in this language. */
      complete: z.number().int(),
      missing: z.array(
        z.object({
          id: z.string(),
          slug: z.string(),
          label: z.string(),
          fields: z.array(z.string()),
        }),
      ),
    }),
  ),
});
export type MissingReport = z.infer<typeof MissingReportSchema>;
export const MissingReportResponseSchema = DataSchema(MissingReportSchema);
