import type { EntityTranslations, MissingReport, ProductDetail } from '@store/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { productTranslations } from '../../db/schema/index.ts';
import { seedTranslations } from '../../db/seed/translations.ts';
import { makeTestApp } from '../../test/app.ts';
import { createBrand, createCategory, createProduct } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';

const app = makeTestApp();
const data = <T>(res: request.Response) => bodyOf<{ data: T }>(res).data;

describe('admin translations', () => {
  it('is admin only', async () => {
    const { product } = await createProduct();
    expect(
      (await request(app).get(`/api/v1/admin/translations/product/${product.id}`)).status,
    ).toBe(401);
    const customer = await signedIn(app, 'customer');
    const res = await customer.shopper.call('get', `/admin/translations/product/${product.id}`);
    expect(res.status).toBe(403);
  });

  it('saves a German name and the German storefront shows it', async () => {
    const admin = await signedIn(app, 'admin');
    const { product } = await createProduct({ slug: 'squeaky-bone', name: 'Squeaky bone' });
    const put = await admin.shopper.call('put', `/admin/translations/product/${product.id}/de`, {
      name: 'Quietschknochen',
      slug: 'quietschknochen',
      description: '  ',
    });
    expect(put.status).toBe(200);
    const saved = data<EntityTranslations>(put);
    expect(saved.locales.de).toMatchObject({
      name: 'Quietschknochen',
      slug: 'quietschknochen',
      description: null,
    });
    expect(saved.locales.fr).toBeNull();
    expect(saved.english).toMatchObject({ name: 'Squeaky bone', slug: 'squeaky-bone' });

    const shop = await request(app)
      .get('/api/v1/products/quietschknochen')
      .set('X-Store-View', 'de-de');
    expect(data<ProductDetail>(shop).name).toBe('Quietschknochen');
    // The admin read is not affected by the store view.
    const adminRead = await admin.shopper.call('get', `/admin/translations/product/${product.id}`);
    expect(data<EntityTranslations>(adminRead).english.name).toBe('Squeaky bone');
  });

  it('replaces the row: omitted fields go back to English', async () => {
    const admin = await signedIn(app, 'admin');
    const { product } = await createProduct();
    const path = `/admin/translations/product/${product.id}/fr`;
    await admin.shopper.call('put', path, { name: 'Os', description: 'Un os.' });
    const again = await admin.shopper.call('put', path, { name: 'Os' });
    expect(data<EntityTranslations>(again).locales.fr).toMatchObject({
      name: 'Os',
      description: null,
    });
  });

  it('answers 409 when a slug is taken, in the same language or as an English slug', async () => {
    const admin = await signedIn(app, 'admin');
    const a = await createProduct({ slug: 'alpha' });
    const b = await createProduct({ slug: 'beta' });
    await admin.shopper.call('put', `/admin/translations/product/${a.product.id}/de`, {
      slug: 'gleich',
    });
    const sameLang = await admin.shopper.call(
      'put',
      `/admin/translations/product/${b.product.id}/de`,
      { slug: 'gleich' },
    );
    expect(sameLang.status).toBe(409);
    expect(errorOf(sameLang).code).toBe('CONFLICT');
    // Another language may reuse it.
    const otherLang = await admin.shopper.call(
      'put',
      `/admin/translations/product/${b.product.id}/fr`,
      { slug: 'gleich' },
    );
    expect(otherLang.status).toBe(200);
    // An English slug of a different product is refused too.
    const english = await admin.shopper.call(
      'put',
      `/admin/translations/product/${b.product.id}/de`,
      { slug: 'alpha' },
    );
    expect(english.status).toBe(409);
  });

  it('refuses fields the entity does not have and unknown locales or ids', async () => {
    const admin = await signedIn(app, 'admin');
    const { product } = await createProduct();
    const stray = await admin.shopper.call('put', `/admin/translations/product/${product.id}/de`, {
      tagline: 'x',
    });
    expect(stray.status).toBe(400);
    expect(
      (await admin.shopper.call('put', `/admin/translations/product/${product.id}/es`, {})).status,
    ).toBe(400);
    expect(
      (
        await admin.shopper.call(
          'put',
          '/admin/translations/product/00000000-0000-4000-8000-000000000000/de',
          {},
        )
      ).status,
    ).toBe(404);
  });

  it('reports what is missing per language', async () => {
    const admin = await signedIn(app, 'admin');
    const category = await createCategory({ slug: 'toys', name: 'Toys' });
    const brand = await createBrand({ slug: 'waggle', name: 'Waggle' });
    await admin.shopper.call('put', `/admin/translations/category/${category.id}/de`, {
      name: 'Spielzeug',
      description: 'Zum Spielen',
    });
    const report = data<MissingReport>(
      await admin.shopper.call('get', '/admin/translations/missing?locale=de'),
    );
    const cats = report.entities.find((e) => e.entity === 'category');
    // `description` of a category is null in English here, so it is still "missing" until filled.
    expect(cats?.total).toBe(1);
    const brands = report.entities.find((e) => e.entity === 'brand');
    expect(brands?.missing[0]).toMatchObject({
      id: brand.id,
      fields: ['name', 'tagline', 'story'],
    });
    expect((await admin.shopper.call('get', '/admin/translations/missing?locale=xx')).status).toBe(
      400,
    );
  });
});

describe('translation seed', () => {
  it('upserts idempotently and rejects unknown slugs and fields', async () => {
    const { product } = await createProduct({ slug: 'seeded' });
    const file = { products: { seeded: { name: 'Gesät', slug: 'gesaet' } } };
    await seedTranslations(db, { de: file });
    await seedTranslations(db, { de: file });
    const rows = await db
      .select()
      .from(productTranslations)
      .where(eq(productTranslations.productId, product.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ locale: 'de', name: 'Gesät', slug: 'gesaet' });
    // A change is applied in place.
    await seedTranslations(db, { de: { products: { seeded: { name: 'Neu' } } } });
    const [after] = await db
      .select()
      .from(productTranslations)
      .where(eq(productTranslations.productId, product.id));
    // Only the fields in the file are refreshed; a field it omits keeps its stored value.
    expect(after).toMatchObject({ name: 'Neu', slug: 'gesaet' });

    await expect(
      seedTranslations(db, { de: { products: { nope: { name: 'x' } } } }),
    ).rejects.toThrow(/no product/);
    await expect(
      seedTranslations(db, { de: { products: { seeded: { tagline: 'x' } } } }),
    ).rejects.toThrow(/unknown field/);
  });
});
