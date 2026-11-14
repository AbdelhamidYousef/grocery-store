import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import {
  flashSaleItems,
  flashSales,
  orders,
  priceHistory,
  productVariants,
} from '../../db/schema/index.ts';
import { PUBLIC_CATALOG_CACHE } from '../../middleware/cache.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, createShippingMethods, createUser } from '../../test/factories.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { bodyOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { hash } from '../auth/password.ts';

const app = makeTestApp({ payments: new FakeStripe() });
const PASSWORD = 'correct horse battery staple';
let passwordHash = '';
beforeAll(async () => {
  passwordHash = await hash(PASSWORD);
});

const HOUR = 3600 * 1000;

// A product whose only variant costs 2000 and has a member price (default 1700, a distinctive
// number so the raw-JSON assertions cannot match something else by accident).
async function memberProduct(memberCents: number | null = 1743, priceCents = 2000) {
  const { variants, product } = await createProduct({ variants: [{ priceCents }] });
  const id = variants[0]!.id;
  await db
    .update(productVariants)
    .set({ memberPriceCents: memberCents })
    .where(eq(productVariants.id, id));
  return { id, slug: product.slug, productId: product.id };
}

describe('catalog: member price visibility', () => {
  it('never puts the member number in an anonymous payload, only hasMemberPrice', async () => {
    const p = await memberProduct();
    for (const path of [`/api/v1/products/${p.slug}`, '/api/v1/products']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('1743');
      expect(res.text).not.toMatch(/memberPrice/);
      expect(res.text).toContain('"hasMemberPrice":true');
      expect(res.text).toContain('"member":null');
    }
  });

  it('a product without a member price says hasMemberPrice false', async () => {
    const p = await memberProduct(null);
    const res = await request(app).get(`/api/v1/products/${p.slug}`);
    expect(res.text).toContain('"hasMemberPrice":false');
  });

  it('a member price that is not below the regular price is not offered at all', async () => {
    const p = await memberProduct(2000);
    const res = await request(app).get(`/api/v1/products/${p.slug}`);
    expect(res.text).toContain('"hasMemberPrice":false');
  });

  it('a signed-in shopper sees the number on the variant and the (lowest) one on the card', async () => {
    const { variants, product } = await createProduct({
      variants: [{ priceCents: 2000 }, { priceCents: 3000, name: 'Big' }],
    });
    await db
      .update(productVariants)
      .set({ memberPriceCents: 1743 })
      .where(eq(productVariants.id, variants[0]!.id));
    await db
      .update(productVariants)
      .set({ memberPriceCents: 1500 })
      .where(eq(productVariants.id, variants[1]!.id));
    const { shopper } = await signedIn(app);
    const detail = bodyOf<{
      data: { variants: { priceCents: number; member: { priceCents: number } | null }[] };
    }>(await shopper.call('get', `/products/${product.slug}`)).data;
    expect(detail.variants.map((v) => [v.priceCents, v.member?.priceCents])).toEqual([
      [2000, 1743],
      [3000, 1500],
    ]);
    const list = bodyOf<{
      data: { slug: string; hasMemberPrice: boolean; member: { priceCents: number } | null }[];
    }>(await shopper.call('get', '/products')).data;
    expect(list.find((c) => c.slug === product.slug)).toMatchObject({
      hasMemberPrice: true,
      member: { priceCents: 1500 },
    });
  });

  it('never offers a member price on a trial size', async () => {
    const { variants, product } = await createProduct({
      variants: [{ priceCents: 2000 }, { priceCents: 600, isTrial: true, name: 'Trial' }],
    });
    await db
      .update(productVariants)
      .set({ memberPriceCents: 500 })
      .where(eq(productVariants.id, variants[1]!.id));
    const { shopper } = await signedIn(app);
    const body = await shopper.call('get', `/products/${product.slug}`);
    expect(body.text).not.toContain('"priceCents":500');
    expect(body.text).toContain('"hasMemberPrice":false');
  });
});

describe('catalog: cache headers by viewer', () => {
  it('guests keep the public cache and every response varies on Cookie', async () => {
    const p = await memberProduct();
    for (const path of ['/api/v1/products', `/api/v1/products/${p.slug}`, '/api/v1/categories']) {
      const res = await request(app).get(path);
      expect(res.headers['cache-control']).toBe(PUBLIC_CATALOG_CACHE);
      expect(res.headers.vary?.toLowerCase()).toContain('cookie');
    }
  });

  it('a signed-in response is private and not stored, and still varies on Cookie', async () => {
    const p = await memberProduct();
    const { shopper } = await signedIn(app);
    for (const path of ['/products', `/products/${p.slug}`]) {
      const res = await shopper.call('get', path);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers.vary?.toLowerCase()).toContain('cookie');
    }
  });

  it('an invalid session cookie is a guest', async () => {
    const res = await request(app).get('/api/v1/products').set('Cookie', 'sid=garbage');
    expect(res.headers['cache-control']).toBe(PUBLIC_CATALOG_CACHE);
  });
});

describe('cart and checkout charge the member price', () => {
  const addr = {
    fullName: 'Ada Lovelace',
    line1: '1 Bone Street',
    city: 'Riga',
    postalCode: 'LV-1010',
    country: 'DE',
  };
  const checkoutBody = {
    email: 'ada@grocery.test',
    shippingAddress: addr,
    shippingMethodCode: 'standard',
  };
  interface CartBody {
    data: {
      pricing: { merchandiseCents: number; lines: { unitCents: number; priceSource: string }[] };
    };
  }

  it('a guest cart is re-priced to the member price after login (merge), and checkout charges it', async () => {
    await createShippingMethods();
    const p = await memberProduct(1743);
    const user = await createUser({ passwordHash });
    const guest = makeShopper(app);
    await guest.addToCart(p.id, 2);
    const before = bodyOf<CartBody>(await guest.call('get', '/cart')).data.pricing;
    expect(before.lines[0]).toMatchObject({ unitCents: 2000, priceSource: 'base' });

    const res = await guest.call('post', '/auth/login', { email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const after = bodyOf<CartBody>(await guest.call('get', '/cart')).data.pricing;
    expect(after.lines[0]).toMatchObject({ unitCents: 1743, priceSource: 'member' });
    expect(after.merchandiseCents).toBe(3486);

    expect((await guest.call('post', '/checkout', checkoutBody)).status).toBe(200);
    const [order] = await db.select().from(orders);
    expect(order?.subtotalCents).toBe(3486);
  });

  it('a guest pays the regular price', async () => {
    await createShippingMethods();
    const p = await memberProduct(1743);
    const guest = makeShopper(app);
    await guest.addToCart(p.id, 1);
    expect((await guest.call('post', '/checkout', checkoutBody)).status).toBe(200);
    expect((await db.select().from(orders))[0]?.subtotalCents).toBe(2000);
  });

  it('a lower sale price wins over the member price; a higher one loses to it', async () => {
    const p = await memberProduct(1743);
    const { shopper } = await signedIn(app);
    const [s] = await db
      .insert(flashSales)
      .values({
        name: 'Flash',
        startsAt: new Date(Date.now() - HOUR),
        endsAt: new Date(Date.now() + 24 * HOUR),
        status: 'active',
      })
      .returning();
    await db
      .insert(flashSaleItems)
      .values({ saleId: s!.id, variantId: p.id, salePriceCents: 1500 });
    await shopper.addToCart(p.id, 1);
    const lower = bodyOf<CartBody>(await shopper.call('get', '/cart')).data.pricing;
    expect(lower.lines[0]).toMatchObject({ unitCents: 1500, priceSource: 'sale' });

    await db.update(flashSaleItems).set({ salePriceCents: 1900 });
    const higher = bodyOf<CartBody>(await shopper.call('get', '/cart')).data.pricing;
    expect(higher.lines[0]).toMatchObject({ unitCents: 1743, priceSource: 'member' });
  });

  it('a trial size stays at its fixed price for a member', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 600, isTrial: true }] });
    await db.update(productVariants).set({ memberPriceCents: 500 });
    const { shopper } = await signedIn(app);
    await shopper.addToCart(variants[0]!.id, 1);
    const cart = bodyOf<CartBody>(await shopper.call('get', '/cart')).data.pricing;
    expect(cart.lines[0]).toMatchObject({ unitCents: 600, priceSource: 'fixed' });
  });
});

describe('admin member price', () => {
  it('appends a member history row when set or changed, and none when unchanged or cleared', async () => {
    const admin = await signedIn(app, 'admin', 'boss@grocery.test');
    const p = await memberProduct(null, 2000);
    const patch = (body: object) => admin.shopper.call('patch', `/admin/variants/${p.id}`, body);
    expect((await patch({ memberPriceCents: 1800 })).status).toBe(200);
    expect((await patch({ memberPriceCents: 1800, name: 'Renamed' })).status).toBe(200);
    expect((await patch({ memberPriceCents: 1700 })).status).toBe(200);
    const cleared = await patch({ memberPriceCents: null });
    expect(cleared.status).toBe(200);
    expect(
      bodyOf<{ data: { memberPriceCents: number | null } }>(cleared).data.memberPriceCents,
    ).toBeNull();
    const rows = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.variantId, p.id))
      .orderBy(priceHistory.createdAt);
    expect(rows.map((r) => [r.kind, r.priceCents])).toEqual([
      ['member', 1800],
      ['member', 1700],
    ]);
  });

  it('refuses a member price at or above the regular price', async () => {
    const admin = await signedIn(app, 'admin', 'boss@grocery.test');
    const p = await memberProduct(null, 2000);
    const patch = (body: object) => admin.shopper.call('patch', `/admin/variants/${p.id}`, body);
    expect((await patch({ memberPriceCents: 2000 })).status).toBe(400);
    expect((await patch({ priceCents: 1500, memberPriceCents: 1600 })).status).toBe(400);
    // Lowering the price under an existing member price is refused too.
    await patch({ memberPriceCents: 1800 });
    expect((await patch({ priceCents: 1800 })).status).toBe(400);
  });

  it('records the member price of a new variant in the history', async () => {
    const admin = await signedIn(app, 'admin', 'boss@grocery.test');
    const p = await memberProduct(null);
    const res = await admin.shopper.call('post', `/admin/products/${p.productId}/variants`, {
      sku: 'MEMBER-SKU-1',
      name: 'New',
      options: { variant: 'new' },
      priceCents: 1499,
      memberPriceCents: 1349,
      weightGrams: 100,
      stock: 5,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = await db.select().from(priceHistory).where(eq(priceHistory.priceCents, 1349));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'member' });
  });
});
