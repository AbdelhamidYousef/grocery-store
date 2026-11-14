import { describe, expect, it } from 'vitest';

import { de } from './de';
import { en } from './en';
import { fr } from './fr';
import type { Entry } from './types';

const keys = (d: Record<string, Entry>) => Object.keys(d).sort();
const placeholders = (e: Entry) =>
  (typeof e === 'string' ? [e] : (Object.values(e) as string[]))
    .flatMap((s) => s.match(/\{\w+\}/g) ?? [])
    .filter((p, i, all) => all.indexOf(p) === i)
    .sort()
    .join(',');

describe.each([
  ['de', de],
  ['fr', fr],
])('%s dictionary', (_name, dict) => {
  it('has exactly the keys of en', () => {
    const missing = keys(en).filter((k) => !(k in dict));
    const extra = keys(dict).filter((k) => !(k in en));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
  it('keeps the same entry shape and placeholders as en', () => {
    const bad = Object.keys(en).filter((k) => {
      const a = en[k as keyof typeof en];
      const b = (dict as Record<string, Entry>)[k];
      if (!b) return false;
      if (typeof a !== typeof b) return true;
      return placeholders(a) !== placeholders(b);
    });
    expect(bad).toEqual([]);
  });
});
