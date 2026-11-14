import { describe, expect, it } from 'vitest';

import { loadTranslationFile, type TranslationFile } from './translations.ts';

// Guards the seed files themselves, no database: a German entry that is byte-identical to the French
// one is almost certainly French pasted into de.json (it happened to 53 products once).
const de = loadTranslationFile('de');
const fr = loadTranslationFile('fr');

// Invented brand names and "Halloween" are proper names: the same in every language, slug included.
const SAME_IN_EVERY_LANGUAGE = (entity: string, key: string, field: string): boolean =>
  (field === 'name' || field === 'slug') &&
  (entity === 'brands' || (entity === 'collections' && key === 'halloween'));

type Section = Record<string, Record<string, string>>;

function identicalToFrench(test: (field: string, value: string) => boolean): string[] {
  const hits: string[] = [];
  for (const [entity, section] of Object.entries(de) as [keyof TranslationFile, Section][]) {
    const frSection: Section = fr[entity] ?? {};
    for (const [key, fields] of Object.entries(section)) {
      for (const [field, value] of Object.entries(fields)) {
        if (SAME_IN_EVERY_LANGUAGE(entity, key, field)) continue;
        if (test(field, value) && value === frSection[key]?.[field])
          hits.push(`${entity}.${key}.${field}`);
      }
    }
  }
  return hits;
}

describe('seed translation files', () => {
  it('has no German string (over 12 characters) identical to its French counterpart', () => {
    expect(identicalToFrench((_field, value) => value.length > 12)).toEqual([]);
  });

  it('has no German slug identical to its French slug', () => {
    expect(identicalToFrench((field) => field === 'slug')).toEqual([]);
  });
});
