import type { ProductCard, ProductDetail } from '@store/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { productVariants, variantPrices } from '../../db/schema/index.ts';
import { seedGbpCents } from '../../db/seed/prices.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';

const app = makeTestApp();
const get = (path: string, store?: string) => {
  const req = request(app).get(path);
  return store ? req.set('X-Store-View', store) : req;
};
type Page<T> = { data: T[] };
const data = <T>(res: request.Response) => bodyOf<{ data: T }>(res).data;

describe('per-currency variant prices', () => {
  it('mirrors the base price into a EUR row, on insert and on update', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1999 }] });
    const id = variants[0]!.id;
    const eur = () => db.select().from(variantPrices).where(eq(variantPrices.variantId, id));
    expect(await eur()).toMatchObject([{ currency: 'EUR', priceCents: 1999 }]);
    await db.update(productVariants).set({ priceCents: 2499 }).where(eq(productVariants.id, id));
    expect(await eur()).toMatchObject([{ currency: 'EUR', priceCents: 2499 }]);
  });

  it('shows GBP prices without a strike-through in the UK store, EUR elsewhere', async () => {
    await createProduct({
      slug: 'rope',
      variants: [{ priceCents: 1999, compareAtPriceCents: 2499, gbpCents: 1699 }],
    });
    const uk = data<ProductDetail>(await get('/api/v1/products/rope', 'uk-en'));
    expect(uk.variants[0]).toMatchObject({
      priceCents: 1699,
      currency: 'GBP',
      compareAtPriceCents: null,
    });
    const de = data<ProductDetail>(await get('/api/v1/products/rope', 'de-de'));
    expect(de.variants[0]).toMatchObject({
      priceCents: 1999,
      currency: 'EUR',
      compareAtPriceCents: 2499,
    });
    const list = bodyOf<Page<ProductCard>>(await get('/api/v1/products', 'uk-en')).data;
    expect(list[0]?.price).toMatchObject({ minCents: 1699, currency: 'GBP' });
  });

  it('hides a variant with no GBP price, and a product with none, in the UK store', async () => {
    await createProduct({
      slug: 'mixed',
      variants: [{ priceCents: 1000, gbpCents: 899 }, { priceCents: 3000 }],
    });
    await createProduct({ slug: 'eur-only', variants: [{ priceCents: 1000 }] });

    const mixed = data<ProductDetail>(await get('/api/v1/products/mixed', 'uk-en'));
    expect(mixed.variants).toHaveLength(1);
    expect(mixed.price).toMatchObject({ minCents: 899, maxCents: 899, currency: 'GBP' });
    expect((await get('/api/v1/products/eur-only', 'uk-en')).status).toBe(404);

    const slugs = bodyOf<Page<ProductCard>>(await get('/api/v1/products', 'uk-en')).data.map(
      (c) => c.slug,
    );
    expect(slugs).toEqual(['mixed']);
    const eu = bodyOf<Page<ProductCard>>(await get('/api/v1/products', 'eu-en')).data;
    expect(eu.map((c) => c.slug).sort()).toEqual(['eur-only', 'mixed']);
  });

  it('sorts and filters by the store currency price', async () => {
    await createProduct({ slug: 'a', variants: [{ priceCents: 1000, gbpCents: 5000 }] });
    await createProduct({ slug: 'b', variants: [{ priceCents: 2000, gbpCents: 900 }] });
    const slugs = async (q: string, store: string) =>
      bodyOf<Page<ProductCard>>(await get(`/api/v1/products?${q}`, store)).data.map((c) => c.slug);
    expect(await slugs('sort=price_asc', 'eu-en')).toEqual(['a', 'b']);
    expect(await slugs('sort=price_asc', 'uk-en')).toEqual(['b', 'a']);
    expect(await slugs('maxPrice=1000', 'uk-en')).toEqual(['b']);
  });

  it('lets an admin set the GBP price grid, and a currency left out hides the variant', async () => {
    const admin = await signedIn(app, 'admin');
    const { variants } = await createProduct({ slug: 'grid', variants: [{ priceCents: 1000 }] });
    const id = variants[0]!.id;
    const put = await admin.shopper.call('put', `/admin/variants/${id}/prices`, {
      prices: [{ currency: 'GBP', priceCents: 849 }],
    });
    expect(put.status).toBe(200);
    expect(data<{ prices: unknown[] }>(put).prices).toEqual([
      { currency: 'EUR', priceCents: 1000 },
      { currency: 'GBP', priceCents: 849 },
    ]);
    expect(
      data<ProductDetail>(await get('/api/v1/products/grid', 'uk-en')).variants[0],
    ).toMatchObject({ priceCents: 849 });

    const cleared = await admin.shopper.call('put', `/admin/variants/${id}/prices`, { prices: [] });
    expect(data<{ prices: unknown[] }>(cleared).prices).toHaveLength(1);
    expect((await get('/api/v1/products/grid', 'uk-en')).status).toBe(404);
  });

  it('refuses EUR, duplicates and unknown currencies in the price grid', async () => {
    const admin = await signedIn(app, 'admin');
    const { variants } = await createProduct();
    const path = `/admin/variants/${variants[0]!.id}/prices`;
    for (const prices of [
      [{ currency: 'EUR', priceCents: 5 }],
      [
        { currency: 'GBP', priceCents: 5 },
        { currency: 'GBP', priceCents: 6 },
      ],
      [{ currency: 'USD', priceCents: 5 }],
      [{ currency: 'GBP', priceCents: 5.5 }],
    ]) {
      expect((await admin.shopper.call('put', path, { prices })).status).toBe(400);
    }
  });

  it('seeds whole-minor-unit GBP prices below the euro price (no floats)', () => {
    for (let eur = 1; eur <= 60_000; eur += 7) {
      const gbp = seedGbpCents(eur);
      expect(Number.isInteger(gbp)).toBe(true);
      expect(gbp).toBeGreaterThan(0);
      expect(gbp).toBeLessThanOrEqual(eur);
    }
    expect(seedGbpCents(1999)).toBe(1699);
  });
});
