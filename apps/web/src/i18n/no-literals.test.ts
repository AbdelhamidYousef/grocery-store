import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// A guard, not a parser: flags JSX text and common text props written as English literals in the
// storefront. Admin stays English by decision; everything else must go through `t()`.
const ROOT = join(import.meta.dirname, '..');
const SKIP = ['features/admin', 'features/legal', 'test/', 'i18n/'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

// `Promise<unknown>;` style generics are not text; a dotted key (`shell.x`), the order-number example
// and the brand name are not translatable text either.
const JSX_TEXT = />\s*[A-Z][a-z]+[^<>{}=;]*[a-z.!?]\s*</;
const ALLOWED = /Promise<|GR-2026-|title="Grocery"|>Grocery<\/span>|="[a-z]+\.[a-zA-Z.]+"/;
const TEXT_PROP = /\b(aria-label|title|placeholder|label|hint)="[A-Za-z][^"]*"/;

describe('storefront strings', () => {
  it('has no hard-coded English in JSX', () => {
    const hits: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file);
      if (SKIP.some((s) => rel.includes(s)) || rel.startsWith('pages/AdminPage')) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (ALLOWED.test(line)) return;
          if (JSX_TEXT.test(line) || TEXT_PROP.test(line))
            hits.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
