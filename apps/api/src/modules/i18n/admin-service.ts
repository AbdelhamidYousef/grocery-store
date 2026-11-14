/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- same five-table treatment as translations.ts */
import {
  ErrorCode,
  TRANSLATION_ENTITIES,
  TRANSLATION_FIELDS,
  TRANSLATION_LOCALES,
  type EntityTranslations,
  type MissingReport,
  type TranslationEntity,
  type TranslationInput,
  type TranslationLocale,
} from '@store/shared';
import { and, eq, ne } from 'drizzle-orm';

import { db } from '../../db/client.ts';
import { uniqueViolation } from '../../lib/db-errors.ts';
import { conflict, notFound, validation } from '../../lib/errors.ts';

import { TABLES } from './translations.ts';

// Admin side of the catalogue translations. Everything here reads and writes the translation
// tables directly; the base (English) rows are only ever read.

const LABEL: Record<TranslationEntity, string> = {
  product: 'name',
  category: 'name',
  brand: 'name',
  collection: 'name',
  guide: 'title',
};

const textFields = (entity: TranslationEntity): readonly string[] => [
  ...TRANSLATION_FIELDS[entity],
  'metaTitle',
  'metaDescription',
];

type Row = Record<string, string | null>;

async function baseRow(entity: TranslationEntity, id: string): Promise<Row & { id: string }> {
  const { base } = TABLES[entity];
  const [row] = (await db.select().from(base).where(eq(base.id, id)).limit(1)) as (Row & {
    id: string;
  })[];
  if (!row) throw notFound(`${entity[0]?.toUpperCase()}${entity.slice(1)} not found`);
  return row;
}

function pickFields(source: Row, fields: readonly string[]): Row {
  return Object.fromEntries(fields.map((f) => [f, source[f] ?? null]));
}

/** English source plus every language's row (null where none exists). */
export async function getEntityTranslations(
  entity: TranslationEntity,
  id: string,
): Promise<EntityTranslations> {
  const base = await baseRow(entity, id);
  const { tr, fk } = TABLES[entity];
  const rows = (await db.select().from(tr).where(eq(fk, id))) as (Row & { locale: string })[];
  const fields = [...TRANSLATION_FIELDS[entity], 'slug', 'metaTitle', 'metaDescription'];
  const locales = Object.fromEntries(
    TRANSLATION_LOCALES.map((locale) => {
      const row = rows.find((r) => r.locale === locale);
      return [locale, row ? pickFields(row, fields) : null];
    }),
  ) as EntityTranslations['locales'];
  return {
    entity,
    id,
    english: { ...pickFields(base, TRANSLATION_FIELDS[entity]), slug: base.slug ?? null },
    locales,
  };
}

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Replaces one language's row (omitted or blank fields become "not translated"). */
export async function putTranslation(
  entity: TranslationEntity,
  id: string,
  locale: TranslationLocale,
  input: TranslationInput,
): Promise<EntityTranslations> {
  await baseRow(entity, id);
  const allowed = new Set([...textFields(entity), 'slug']);
  const stray = Object.keys(input).filter((k) => !allowed.has(k));
  if (stray.length > 0) {
    throw validation({
      formErrors: [],
      fieldErrors: Object.fromEntries(
        stray.map((k) => [k, [`${entity} has no translatable "${k}"`]]),
      ),
    });
  }
  const { tr, fk, fkKey, base: baseTable } = TABLES[entity];
  const values: Row = { slug: clean(input.slug) };
  for (const f of textFields(entity)) values[f] = clean((input as Row)[f]);

  // A translated slug may not equal another row's English slug in the same entity: lookups try
  // the English slug first, so the translated page would never be reachable.
  if (values.slug) {
    const [clash] = await db
      .select({ id: baseTable.id })
      .from(baseTable)
      .where(and(eq(baseTable.slug, values.slug), ne(baseTable.id, id)))
      .limit(1);
    if (clash) throw conflict(ErrorCode.CONFLICT, 'That slug is already used by another page');
  }
  try {
    await db
      .insert(tr)
      .values({ [fkKey]: id, locale, ...values })
      .onConflictDoUpdate({ target: [fk, tr.locale], set: { ...values, updatedAt: new Date() } });
  } catch (err) {
    if (uniqueViolation(err) !== undefined) {
      throw conflict(ErrorCode.CONFLICT, 'That slug is already used in this language');
    }
    throw err;
  }
  return getEntityTranslations(entity, id);
}

/** Per entity type: how many are fully translated into `locale`, and the ones that are not. */
export async function missingReport(locale: TranslationLocale): Promise<MissingReport> {
  const entities = [];
  for (const entity of TRANSLATION_ENTITIES) {
    const { base, tr, fkKey } = TABLES[entity];
    const [bases, trs] = (await Promise.all([
      db.select().from(base),
      db.select().from(tr).where(eq(tr.locale, locale)),
    ])) as [(Row & { id: string })[], (Row & { [k: string]: string | null })[]];
    const byId = new Map(trs.map((t) => [t[fkKey] as string, t]));
    const need = TRANSLATION_FIELDS[entity];
    const missing = [];
    for (const row of bases) {
      const t = byId.get(row.id);
      const fields = need.filter((f) => !t?.[f]?.trim());
      if (fields.length > 0) {
        missing.push({
          id: row.id,
          slug: row.slug ?? '',
          label: row[LABEL[entity]] ?? row.slug ?? '',
          fields,
        });
      }
    }
    entities.push({
      entity,
      total: bases.length,
      complete: bases.length - missing.length,
      missing,
    });
  }
  return { locale, entities };
}
