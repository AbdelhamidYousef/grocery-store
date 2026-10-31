import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { helpArticles } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { bodyOf } from '../../test/http.ts';

import { searchHelp } from './service.ts';

const app = makeTestApp();

let n = 0;
async function article(over: Partial<typeof helpArticles.$inferInsert> = {}) {
  n += 1;
  await db.insert(helpArticles).values({
    slug: `a-${n}`,
    topic: 'shipping',
    question: `Question ${n}`,
    answerMd: `Answer ${n}`,
    sortOrder: n,
    ...over,
  });
}

interface Hit {
  slug: string;
  topic: string;
  snippet: string | null;
}
const get = async (qs: string) =>
  bodyOf<{ data: Hit[] }>(await request(app).get(`/api/v1/help${qs}`)).data;

describe('searchHelp', () => {
  it('ranks a title match above a body match', async () => {
    await article({ slug: 'body', question: 'Something else', answerMd: 'We offer a refund.' });
    await article({ slug: 'title', question: 'How do refunds work?', answerMd: 'Ask us.' });
    expect((await searchHelp('refund')).map((h) => h.slug)).toEqual(['title', 'body']);
  });

  it('lists by topic in the editors order when the query is empty', async () => {
    await article({ slug: 'p2', topic: 'payments', sortOrder: 2 });
    await article({ slug: 'p1', topic: 'payments', sortOrder: 1 });
    await article({ slug: 's1', topic: 'shipping' });
    expect((await get('?topic=payments')).map((h) => h.slug)).toEqual(['p1', 'p2']);
    expect((await get('?q=')).map((h) => h.slug)).toHaveLength(3);
    expect((await get('?topic=payments'))[0]?.snippet).toBeNull();
  });

  it('narrows a search to one topic', async () => {
    await article({ slug: 'ship', question: 'Parcel delay', topic: 'shipping' });
    await article({ slug: 'ret', question: 'Parcel returns', topic: 'returns' });
    expect((await get('?q=parcel&topic=returns')).map((h) => h.slug)).toEqual(['ret']);
  });

  it('highlights the match in a plain-text snippet without HTML', async () => {
    await article({
      slug: 'html',
      question: 'Delivery',
      answerMd: 'Standard **delivery** takes <b>3 days</b> to arrive.',
    });
    const [hit] = await get('?q=delivery');
    expect(hit?.snippet).toContain('');
    expect(hit?.snippet).not.toContain('**');
  });

  it.each([
    '50%',
    "100% 'quoted'",
    'a & b | !c',
    '"unclosed',
    "'; drop table help_articles; --",
    '\\',
    ':*',
    '()',
  ])('is safe with the special characters in %j', async (q) => {
    await article({ question: 'Normal question', answerMd: 'Normal answer' });
    const res = await request(app).get('/api/v1/help').query({ q });
    expect(res.status).toBe(200);
    // The table is still there.
    expect(await db.select().from(helpArticles)).toHaveLength(1);
  });

  it('falls back to a substring match for a query of only stop words', async () => {
    await article({ slug: 'the', question: 'What is the answer?', answerMd: 'The thing.' });
    expect((await get('?q=the')).map((h) => h.slug)).toEqual(['the']);
  });

  it('returns nothing for gibberish and hides drafts', async () => {
    await article({ slug: 'draft', question: 'Refund secret', status: 'draft' });
    expect(await get('?q=refund')).toEqual([]);
    expect(await get('?q=zzzzqx')).toEqual([]);
  });

  it('rejects an unknown topic', async () => {
    expect((await request(app).get('/api/v1/help?topic=weather')).status).toBe(400);
  });
});
