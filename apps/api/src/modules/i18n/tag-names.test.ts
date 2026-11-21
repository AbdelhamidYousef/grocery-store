import type { Facets, ProductDetail } from '@store/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct, createTag, tagProduct } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';

import { tagName } from './tag-names.ts';

const app = makeTestApp();

describe('tag names in German', () => {
  it('translates by slug and keeps the English name for a tag nobody translated', () => {
    expect(tagName('breakfast', 'Breakfast', 'de')).toBe('Frühstück');
    expect(tagName('breakfast', 'Breakfast', 'en')).toBe('Breakfast');
    expect(tagName('made-by-an-admin', 'Picnic', 'de')).toBe('Picnic');
  });

  it('answers the product page and the filter list in the language of the store view', async () => {
    const category = await createCategory({ slug: 'dairy' });
    const { product } = await createProduct({ slug: 'yogurt', categoryId: category.id });
    const tag = await createTag({ slug: 'breakfast', name: 'Breakfast' });
    await tagProduct(product.id, tag.id);

    const en = await request(app).get('/api/v1/products/yogurt');
    expect(bodyOf<{ data: ProductDetail }>(en).data.tags[0]?.name).toBe('Breakfast');

    const de = await request(app).get('/api/v1/products/yogurt').set('X-Store-View', 'de-de');
    expect(bodyOf<{ data: ProductDetail }>(de).data.tags[0]).toEqual({
      slug: 'breakfast',
      name: 'Frühstück',
    });

    const list = await request(app).get('/api/v1/products').set('X-Store-View', 'de-de');
    const facets = bodyOf<{ facets: Facets }>(list).facets.tag;
    expect(facets).toEqual([{ value: 'breakfast', label: 'Frühstück', count: 1 }]);
  });
});
