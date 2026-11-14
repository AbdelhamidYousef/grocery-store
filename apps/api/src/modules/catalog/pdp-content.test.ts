import type { ProductDetail } from '@store/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { productFaqs, productSpecs, products, variantConstituents } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';

const app = makeTestApp();

async function detail(slug: string) {
  const res = await request(app).get(`/api/v1/products/${slug}`);
  return { res, data: bodyOf<{ data: ProductDetail }>(res).data };
}

describe('structured product content in GET /products/:slug', () => {
  it('returns empty lists and nulls for a product with no content', async () => {
    await createProduct({ slug: 'plain' });
    const { data } = await detail('plain');
    expect(data).toMatchObject({
      specs: [],
      faqs: [],
      deliveryNote: null,
    });
    expect(data.variants[0]?.constituents).toEqual([]);
  });

  it('returns specs and FAQs in the editor order', async () => {
    const { product } = await createProduct({ slug: 'kibble' });
    await db.insert(productSpecs).values([
      { productId: product.id, label: 'Origin', value: 'Nowhere', sortOrder: 2 },
      { productId: product.id, label: 'Grain', value: 'Free', sortOrder: 1 },
    ]);
    await db.insert(productFaqs).values([
      { productId: product.id, question: 'Second?', answer: 'Yes.', sortOrder: 2 },
      { productId: product.id, question: 'First?', answer: 'Also yes.', sortOrder: 1 },
    ]);
    const { data } = await detail('kibble');
    expect(data.specs.map((s) => s.label)).toEqual(['Grain', 'Origin']);
    expect(data.faqs.map((f) => f.question)).toEqual(['First?', 'Second?']);
    expect(data.faqs[0]?.id).toEqual(expect.any(String));
  });

  it('returns constituents per variant as basis points, protein first', async () => {
    const { variants } = await createProduct({
      slug: 'food',
      variants: [{ name: 'Small' }, { name: 'Large' }],
    });
    await db.insert(variantConstituents).values([
      { variantId: variants[0]!.id, key: 'fat', valueBp: 1200 },
      { variantId: variants[0]!.id, key: 'protein', valueBp: 2650 },
      { variantId: variants[0]!.id, key: 'kcal', valueBp: 365 },
      { variantId: variants[1]!.id, key: 'protein', valueBp: 2700 },
    ]);
    const { data } = await detail('food');
    const byId = new Map(data.variants.map((v) => [v.id, v.constituents]));
    expect(byId.get(variants[0]!.id)).toEqual([
      { key: 'protein', valueBp: 2650 },
      { key: 'fat', valueBp: 1200 },
      { key: 'kcal', valueBp: 365 },
    ]);
    expect(byId.get(variants[1]!.id)).toEqual([{ key: 'protein', valueBp: 2700 }]);
  });

  it('returns the delivery note', async () => {
    const { product } = await createProduct({ slug: 'noted' });
    await db
      .update(products)
      .set({ deliveryNote: 'Ships in its own box.' })
      .where(eq(products.id, product.id));
    const { data } = await detail('noted');
    expect(data.deliveryNote).toBe('Ships in its own box.');
  });
});

describe('database rules for the content tables', () => {
  it('refuses a constituent key outside the list and a percentage above 100 %', async () => {
    const { variants } = await createProduct();
    const variantId = variants[0]!.id;
    await expect(
      db.insert(variantConstituents).values({ variantId, key: 'sugar', valueBp: 100 }),
    ).rejects.toThrow();
    await expect(
      db.insert(variantConstituents).values({ variantId, key: 'protein', valueBp: 10001 }),
    ).rejects.toThrow();
    // kcal is a plain number, allowed above 10000 bp but capped.
    await expect(
      db.insert(variantConstituents).values({ variantId, key: 'kcal', valueBp: 9001 }),
    ).rejects.toThrow();
  });
});
