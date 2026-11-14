import type { ProductDetail } from '@store/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  productFaqs,
  productSpecs,
  products,
  sizeGuides,
  variantConstituents,
} from '../../db/schema/index.ts';
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
      sizeGuide: null,
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

  it('returns the size guide and the delivery note', async () => {
    const [guide] = await db
      .insert(sizeGuides)
      .values({
        slug: 'harness',
        title: 'Harness sizes',
        rows: {
          columns: ['Chest (cm)'],
          rows: [{ size: 'M', label: 'Medium', values: ['55 to 70'] }],
        },
        howtoMd: '1. Measure.',
        tip: 'In between sizes? Size up.',
      })
      .returning();
    const { product } = await createProduct({ slug: 'harness-1' });
    await db
      .update(products)
      .set({ sizeGuideId: guide!.id, deliveryNote: 'Ships in its own box.' })
      .where(eq(products.id, product.id));
    const { data } = await detail('harness-1');
    expect(data.deliveryNote).toBe('Ships in its own box.');
    expect(data.sizeGuide).toEqual({
      slug: 'harness',
      title: 'Harness sizes',
      columns: ['Chest (cm)'],
      rows: [{ size: 'M', label: 'Medium', values: ['55 to 70'] }],
      howtoMd: '1. Measure.',
      tip: 'In between sizes? Size up.',
    });
  });

  it('keeps the product when its size guide is deleted', async () => {
    const [guide] = await db
      .insert(sizeGuides)
      .values({ slug: 'g', title: 'G', rows: { columns: ['a'], rows: [] }, howtoMd: '' })
      .returning();
    const { product } = await createProduct({ slug: 'keeps' });
    await db.update(products).set({ sizeGuideId: guide!.id }).where(eq(products.id, product.id));
    await db.delete(sizeGuides).where(eq(sizeGuides.id, guide!.id));
    const { res, data } = await detail('keeps');
    expect(res.status).toBe(200);
    expect(data.sizeGuide).toBeNull();
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
