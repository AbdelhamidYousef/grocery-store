/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- generic over the five translation tables (see modules/i18n/translations.ts) */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRANSLATION_ENTITIES, TRANSLATION_FIELDS, type TranslationEntity } from '@store/shared';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { TABLES } from '../../modules/i18n/translations.ts';
import { db, type Tx } from '../client.ts';

// Catalogue translations as data: `translations/<lang>.json`, shaped
//   { "products": { "<english slug>": { "name", "description", "slug" } }, "categories": {...}, ... }
// `seedTranslations` upserts them (run it twice and nothing is duplicated); a file can therefore be
// filled in by hand or by a model and re-seeded. `export-untranslated` prints the English source of
// only what is still missing, in the same shape, ready to be filled in.

export const SEED_LANGS = ['de', 'fr'] as const;
const DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'translations');

export const KEY_BY_ENTITY: Record<TranslationEntity, string> = {
  product: 'products',
  category: 'categories',
  brand: 'brands',
  collection: 'collections',
  guide: 'guides',
};

// Keys are validated per entity when seeding; here only "string to string".
const Fields = z.record(z.string(), z.string());
const FileSchema = z.object({
  products: z.record(z.string(), Fields).optional(),
  categories: z.record(z.string(), Fields).optional(),
  brands: z.record(z.string(), Fields).optional(),
  collections: z.record(z.string(), Fields).optional(),
  guides: z.record(z.string(), Fields).optional(),
});
export type TranslationFile = z.infer<typeof FileSchema>;

export function loadTranslationFile(lang: string): TranslationFile {
  const path = join(DIR, `${lang}.json`);
  if (!existsSync(path)) return {};
  return FileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Upserts every translation of every language file. Unknown slugs or fields are errors. */
export async function seedTranslations(
  tx: Tx | typeof db,
  files: Record<string, TranslationFile> = Object.fromEntries(
    SEED_LANGS.map((l) => [l, loadTranslationFile(l)]),
  ),
): Promise<number> {
  let written = 0;
  for (const [lang, file] of Object.entries(files)) {
    for (const entity of TRANSLATION_ENTITIES) {
      const entries = file[KEY_BY_ENTITY[entity] as keyof TranslationFile] ?? {};
      const { base, tr, fk, fkKey } = TABLES[entity];
      const allowed = new Set([
        ...TRANSLATION_FIELDS[entity],
        'slug',
        'metaTitle',
        'metaDescription',
      ]);
      for (const [slug, fields] of Object.entries(entries)) {
        const bad = Object.keys(fields).filter((k) => !allowed.has(k));
        if (bad.length > 0)
          throw new Error(`${lang}.json ${entity} "${slug}": unknown field ${bad.join(', ')}`);
        const [row] = (await tx.select({ id: base.id }).from(base).where(eq(base.slug, slug))) as {
          id: string;
        }[];
        if (!row) throw new Error(`${lang}.json: no ${entity} with slug "${slug}"`);
        const values = Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, v.trim() || null]),
        );
        await tx
          .insert(tr)
          .values({ [fkKey]: row.id, locale: lang, ...values })
          .onConflictDoUpdate({
            target: [fk, tr.locale],
            set: { ...values, updatedAt: sql`now()` },
          });
        written += 1;
      }
    }
  }
  return written;
}

/** English source for what a language still lacks, in the seed file's shape. */
export async function exportUntranslated(lang: string): Promise<TranslationFile> {
  const out: Record<string, Record<string, Record<string, string>>> = {};
  const existing = loadTranslationFile(lang);
  for (const entity of TRANSLATION_ENTITIES) {
    const { base } = TABLES[entity];
    const rows = (await db.select().from(base)) as Record<string, string | null>[];
    const have = existing[KEY_BY_ENTITY[entity] as keyof TranslationFile] ?? {};
    const section: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      const slug = row.slug as string;
      const done = have[slug] ?? {};
      const todo: Record<string, string> = {};
      for (const field of TRANSLATION_FIELDS[entity]) {
        const english = row[field];
        if (english && !done[field]?.trim()) todo[field] = english;
      }
      if (Object.keys(todo).length > 0) section[slug] = todo;
    }
    if (Object.keys(section).length > 0) out[KEY_BY_ENTITY[entity]] = section;
  }
  return out;
}

// pnpm --filter @store/api translations:export -- de   (prints JSON to stdout)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lang = process.argv[2] ?? '';
  if (!(SEED_LANGS as readonly string[]).includes(lang)) {
    console.error(`usage: export-untranslated <${SEED_LANGS.join('|')}>`);
    process.exit(1);
  }
  const { closeDb } = await import('../client.ts');
  console.log(JSON.stringify(await exportUntranslated(lang), null, 2));
  await closeDb();
}
