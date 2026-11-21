import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../client.ts';

import { loadContent, seedContent } from './content.ts';
import { runSeed } from './index.ts';

async function contentCounts() {
  const rows = await db.execute<Record<string, number>>(sql`
    select
      (select count(*)::int from guide_categories) as categories,
      (select count(*)::int from guides) as guides,
      (select count(*)::int from guide_products) as links,
      (select count(*)::int from help_articles) as help,
      (select count(*)::int from testimonials) as testimonials`);
  return rows[0];
}

// A throwaway content folder, so a test can break exactly one file.
function contentDir(files: { guides?: Record<string, string>; help?: Record<string, string> }) {
  const dir = mkdtempSync(join(tmpdir(), 'grocery-content-'));
  for (const kind of ['guides', 'help'] as const) {
    mkdirSync(join(dir, kind));
    for (const [name, text] of Object.entries(files[kind] ?? {})) {
      writeFileSync(join(dir, kind, name), text);
    }
  }
  return dir;
}

const goodGuide = `---
title: "A guide"
slug: a-guide
category: Recipes
summary: "Short."
products: []
publishedAt: 2026-03-04
---

Body.
`;

describe('content seed', () => {
  it('seeds five guides and twenty help articles, and seeding twice changes nothing', async () => {
    await runSeed();
    const first = await contentCounts();
    await runSeed();
    expect(await contentCounts()).toEqual(first);
    expect(first).toMatchObject({ guides: 5, help: 20, testimonials: 6 });
    expect(first?.links).toBeGreaterThan(15);
  });

  it('drops the help articles whose slug was retired (a re-seed keeps no parcel answers)', async () => {
    await db.execute(sql`
      insert into help_articles (slug, topic, question, answer_md, sort_order)
      values ('which-countries-do-you-ship-to', 'shipping', 'Which countries?', 'Europe.', 99)`);
    await runSeed();
    const rows = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from help_articles where slug = 'which-countries-do-you-ship-to'`,
    );
    expect(rows[0]?.n).toBe(0);
    const left = await contentCounts();
    expect(left?.help).toBe(20);
  });

  it('refreshes a guide in place instead of duplicating it', async () => {
    await runSeed();
    await db.execute(sql`update guides set title = 'Edited by hand' where slug = 'lunchbox-ideas'`);
    await runSeed();
    const rows = await db.execute<{ title: string }>(
      sql`select title from guides where slug = 'lunchbox-ideas'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('Five lunchbox ideas for the week');
  });

  it('parses front matter, including an unquoted date and the category slug', () => {
    const [guide] = loadContent(contentDir({ guides: { 'a-guide.md': goodGuide } })).guides;
    expect(guide).toMatchObject({ slug: 'a-guide', categorySlug: 'recipes', bodyMd: 'Body.' });
    expect(guide?.publishedAt).toEqual(new Date('2026-03-04'));
  });

  it.each([
    ['a missing summary', goodGuide.replace('summary: "Short."\n', ''), 'summary'],
    ['an unknown key', goodGuide.replace('products: []', 'sumary: x'), 'sumary'],
    ['a bad date', goodGuide.replace('2026-03-04', 'last tuesday'), 'publishedAt'],
    [
      'a slug that is not the file name',
      goodGuide.replace('slug: a-guide', 'slug: other'),
      'file name',
    ],
    ['an empty body', goodGuide.replace('Body.', ''), 'body is empty'],
  ])('fails loudly on %s', (_what, text, message) => {
    expect(() => loadContent(contentDir({ guides: { 'a-guide.md': text } }))).toThrow(message);
  });

  it('fails on a help article with an unknown topic', () => {
    const help = '---\nslug: q\ntopic: weather\nquestion: Q?\n---\n\nA.\n';
    expect(() => loadContent(contentDir({ help: { 'q.md': help } }))).toThrow('content/q.md');
  });

  it('fails when a guide links a product the catalogue does not have', async () => {
    const dir = contentDir({
      guides: { 'a-guide.md': goodGuide.replace('products: []', 'products: [no-such-product]') },
    });
    await expect(
      db.transaction((tx) => seedContent(tx, loadContent(dir), new Map())),
    ).rejects.toThrow('unknown product "no-such-product"');
  });
});
