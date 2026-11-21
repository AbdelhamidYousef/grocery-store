import { addDays } from '@store/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { productVariants } from '../../db/schema/index.ts';
import { DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { makeShopper } from '../../test/shopper.ts';
import { expectBatchInvariant, setBatches } from '../../test/stock.ts';
import { todayKey } from '../stock/batches.ts';

const app = makeTestApp();

beforeEach(async () => {
  await createShippingMethods();
});

async function bananas() {
  const product = await createProduct({
    name: 'Bananas',
    shelfLifeDays: 5,
    variants: [
      {
        priceCents: 189,
        netAmount: 500,
        netUnit: 'g',
        weight: { pricePerKgCents: 378, nominalGrams: 500 },
      },
    ],
  });
  return { slug: product.product.slug, variantId: product.variants[0]!.id };
}

describe('items sold by weight', () => {
  it('says so on the product page, with the estimate of one unit', async () => {
    const { slug } = await bananas();
    const res = await makeShopper(app).call('get', `/products/${slug}`);
    const [variant] = bodyOf<{
      data: { variants: { weight: object | null; priceCents: number }[] };
    }>(res).data.variants;
    expect(variant).toMatchObject({
      priceCents: 189,
      weight: { pricePerKgCents: 378, nominalGrams: 500, estimateCents: 189 },
    });
  });

  it('puts the nominal grams on the card of a weighed product, and null on any other', async () => {
    await bananas();
    await createProduct({ name: 'Plain tin', variants: [{ priceCents: 300 }] });
    const res = await makeShopper(app).call('get', '/products?sort=name');
    const cards = bodyOf<{ data: { name: string; weighedGrams: number | null }[] }>(res).data;
    expect(cards.map((c) => [c.name, c.weighedGrams])).toEqual([
      ['Bananas', 500],
      ['Plain tin', null],
    ]);
  });

  it('carries the weight on the cart line, priced at the estimate', async () => {
    const { variantId } = await bananas();
    const shopper = makeShopper(app);
    const res = await shopper.call('post', '/cart/items', { variantId, quantity: 3 });
    const [line] = bodyOf<{
      data: { items: { weight: object | null; lineTotalCents: number; unitPriceCents: number }[] };
    }>(res).data.items;
    expect(line).toMatchObject({
      unitPriceCents: 189,
      lineTotalCents: 567,
      weight: { pricePerKgCents: 378, nominalGrams: 500 },
    });
  });

  it('offers no short-dated deal on a weighed item, even with short-dated packs', async () => {
    const { slug, variantId } = await bananas();
    await setBatches(DEFAULT_STORE_ID, variantId, [
      { bestBefore: addDays(todayKey(), 1), quantity: 4 },
      { bestBefore: addDays(todayKey(), 5), quantity: 6 },
    ]);
    const shopper = makeShopper(app);
    const pdp = await shopper.call('get', `/products/${slug}`);
    expect(
      bodyOf<{ data: { variants: { shortDated: unknown }[] } }>(pdp).data.variants[0]!.shortDated,
    ).toBeNull();
    const add = await shopper.call('post', '/cart/items', {
      variantId,
      quantity: 1,
      shortDated: true,
    });
    expect(add.status).toBe(409);
    const deals = await shopper.call('get', '/products/short-dated');
    expect(bodyOf<{ data: unknown[] }>(deals).data).toHaveLength(0);
    await expectBatchInvariant();
  });

  it('refuses a half-described weighed variant in the database', async () => {
    const { variantId } = await bananas();
    const { sql } = await import('drizzle-orm');
    await expect(
      db.execute(sql`update product_variants set nominal_grams = null where id = ${variantId}`),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`update product_variants set price_per_kg_cents = 5 where price_per_kg_cents is null`,
      ),
    ).resolves.toBeDefined();
    expect(await db.select().from(productVariants)).toHaveLength(1);
  });
});
