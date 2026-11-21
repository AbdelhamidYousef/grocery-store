import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { shippingMethods } from '../../db/schema/index.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf, cookieValue, errorOf } from '../../test/http.ts';

const app = makeTestApp();

interface Quotes {
  data: { code: string; priceCents: number; free: boolean }[];
}

async function seedMethods() {
  await db.insert(shippingMethods).values([
    {
      code: 'standard',
      name: 'Standard',
      baseCents: 490,
      perKgCents: 100,
      freeOverCents: 4900,
      etaDaysMin: 3,
      etaDaysMax: 5,
    },
    {
      code: 'express',
      name: 'Express',
      baseCents: 990,
      perKgCents: 200,
      etaDaysMin: 1,
      etaDaysMax: 2,
    },
    {
      code: 'retired',
      name: 'Retired',
      baseCents: 1,
      perKgCents: 0,
      etaDaysMin: 1,
      etaDaysMax: 1,
      isActive: false,
    },
  ]);
}

describe('GET /checkout/shipping-methods', () => {
  it('prices the active methods for the current cart weight and subtotal', async () => {
    await seedMethods();
    const { variants } = await createProduct({
      variants: [{ priceCents: 1000, weightGrams: 1500 }],
    });
    const add = await request(app)
      .post('/api/v1/cart/items')
      .set('Origin', TEST_ORIGIN)
      .send({ variantId: variants[0]!.id, quantity: 2 });
    const cookie = `cart_id=${cookieValue(add, 'cart_id')}`;

    // 2 x 1500 g = 3 kg, subtotal 2000: below the free threshold.
    const res = await request(app)
      .get('/api/v1/checkout/shipping-methods?country=de')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(bodyOf<Quotes>(res).data).toMatchObject([
      { code: 'standard', priceCents: 790, free: false },
      { code: 'express', priceCents: 1590, free: false },
    ]);
  });

  it('gives free standard shipping once the subtotal reaches the threshold', async () => {
    await seedMethods();
    const { variants } = await createProduct({ variants: [{ priceCents: 2500 }] });
    const add = await request(app)
      .post('/api/v1/cart/items')
      .set('Origin', TEST_ORIGIN)
      .send({ variantId: variants[0]!.id, quantity: 2 });
    const res = await request(app)
      .get('/api/v1/checkout/shipping-methods?country=DE')
      .set('Cookie', `cart_id=${cookieValue(add, 'cart_id')}`);
    expect(bodyOf<Quotes>(res).data[0]).toMatchObject({
      code: 'standard',
      priceCents: 0,
      free: true,
    });
  });

  it('quotes base prices for an empty cart', async () => {
    await seedMethods();
    const res = await request(app).get('/api/v1/checkout/shipping-methods?country=DE');
    expect(bodyOf<Quotes>(res).data.map((q) => q.priceCents)).toEqual([490, 990]);
  });

  it('rejects a missing, malformed or unsupported country', async () => {
    await seedMethods();
    for (const query of ['', '?country=', '?country=XX', '?country=Germany']) {
      const res = await request(app).get(`/api/v1/checkout/shipping-methods${query}`);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    }
  });
});
