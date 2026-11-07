import type { Suggestions } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createBrand, createCategory, createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';

const app = makeTestApp();

async function suggest(q: string) {
  const res = await request(app).get('/api/v1/search/suggest').query({ q });
  return { res, data: res.status === 200 ? bodyOf<{ data: Suggestions }>(res).data : undefined };
}

describe('GET /search/suggest', () => {
  it('rejects a one-character query with 400 and a missing one too', async () => {
    const one = await suggest('c');
    expect(one.res.status).toBe(400);
    expect(errorOf(one.res).code).toBe('VALIDATION_ERROR');
    expect((await request(app).get('/api/v1/search/suggest')).status).toBe(400);
  });

  it('ranks a name that starts with the input before a word-start match before a substring', async () => {
    await createProduct({ name: 'Mega Chewy Bone' });
    await createProduct({ name: 'Rubber Chew Ring' });
    await createProduct({ name: 'Chew Stick Deluxe' });
    await createProduct({ name: 'Purchewer' });
    const names = (await suggest('chew')).data?.products.map((p) => p.name) ?? [];
    expect(names).toHaveLength(4);
    expect(names[0]).toBe('Chew Stick Deluxe');
    // Two word-start matches tie on rank; trigram similarity orders them, either way they sit
    // between the prefix match and the plain substring match.
    expect(names.slice(1, 3).sort()).toEqual(['Mega Chewy Bone', 'Rubber Chew Ring']);
    expect(names[3]).toBe('Purchewer');
  });

  it('caps products at 5, categories at 3 and brands at 3', async () => {
    for (let i = 0; i < 7; i += 1) await createProduct({ name: `Zork toy ${i}` });
    for (let i = 0; i < 5; i += 1) await createCategory({ name: `Zork cat ${i}` });
    for (let i = 0; i < 5; i += 1) await createBrand({ name: `Zork brand ${i}` });
    const { data } = await suggest('zork');
    expect(data?.products).toHaveLength(5);
    expect(data?.categories).toHaveLength(3);
    expect(data?.brands).toHaveLength(3);
  });

  it('never leaks draft or archived products, nor products nobody can buy', async () => {
    await createProduct({ name: 'Quokka visible' });
    await createProduct({ name: 'Quokka draft', status: 'draft' });
    await createProduct({ name: 'Quokka archived', status: 'archived' });
    await createProduct({ name: 'Quokka no variant', variants: [{ status: 'archived' }] });
    const { data } = await suggest('quokka');
    expect(data?.products.map((p) => p.name)).toEqual(['Quokka visible']);
  });

  it('returns minimal fields: name, slug, thumbnail and the from price in cents', async () => {
    await createProduct({
      name: 'Walrus Mat',
      variants: [{ priceCents: 2500 }, { priceCents: 1500 }],
      images: [{ url: '/products/walrus.webp', alt: 'A walrus mat' }],
    });
    const { data } = await suggest('walrus');
    const [first] = data?.products ?? [];
    expect(typeof first?.slug).toBe('string');
    expect({ ...first, slug: '' }).toEqual({
      name: 'Walrus Mat',
      slug: '',
      imageUrl: '/products/walrus.webp',
      imageAlt: 'A walrus mat',
      priceFromCents: 1500,
      currency: 'EUR',
    });
  });

  it('finds a product through a typo (trigram) and through the description (full text)', async () => {
    await createProduct({ name: 'Hedgehog Hideaway' });
    await createProduct({
      name: 'Plain Bowl',
      description: 'Dishwasher safe porcelain for ferrets',
    });
    expect((await suggest('hedgehok')).data?.products.map((p) => p.name)).toContain(
      'Hedgehog Hideaway',
    );
    expect((await suggest('ferrets')).data?.products.map((p) => p.name)).toContain('Plain Bowl');
  });

  it('matches categories (with the parent for context) and brands', async () => {
    const parent = await createCategory({ name: 'Wombats' });
    await createCategory({ name: 'Wombat Toys', parentId: parent.id });
    await createBrand({ name: 'Wombatix' });
    const { data } = await suggest('wombat');
    expect(data?.categories.map((c) => c.name)).toContain('Wombat Toys');
    expect(data?.categories.find((c) => c.name === 'Wombat Toys')?.parentName).toBe('Wombats');
    expect(data?.brands.map((b) => b.name)).toEqual(['Wombatix']);
  });

  it('treats % and _ as characters, not wildcards', async () => {
    await createProduct({ name: '100% Beef Chew' });
    await createProduct({ name: 'Other thing' });
    expect((await suggest('100%')).data?.products.map((p) => p.name)).toEqual(['100% Beef Chew']);
  });

  it('is cacheable by anyone and carries no cookie dependence', async () => {
    await createProduct({ name: 'Cacheable Cushion' });
    const { res } = await suggest('cacheable');
    expect(res.headers['cache-control']).toBe('public, max-age=30');
    expect(res.headers.vary ?? '').not.toMatch(/cookie/i);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rate limits per IP', async () => {
    const limited = makeTestApp({ config: { suggestRateLimit: { windowMs: 60_000, limit: 2 } } });
    const hit = () => request(limited).get('/api/v1/search/suggest').query({ q: 'abc' });
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(429);
  });
});
