import type { DeliveryArea, PostcodeLookup } from '@store/shared';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { darkStores, deliveryAreas, postcodes } from '../../db/schema/index.ts';
import { AREA_SEEDS, DEFAULT_STORE_ID } from '../../db/seed/delivery.ts';
import { makeTestApp } from '../../test/app.ts';
import { bodyOf } from '../../test/http.ts';
import { currentDelivery, deliveryContext } from '../i18n/context.ts';

import { clearDeliveryCache, lookupPostcode } from './areas.ts';

const app = makeTestApp();

const lookup = async (code: string) => {
  const res = await request(app).get(`/api/v1/delivery/postcodes/${code}`);
  return { res, data: bodyOf<{ data: PostcodeLookup }>(res).data };
};

describe('GET /delivery/postcodes/:code', () => {
  it('answers a served postcode with its area and store', async () => {
    const { res, data } = await lookup('12045');
    expect(res.status).toBe(200);
    expect(data).toEqual({
      postcode: '12045',
      served: true,
      area: { slug: 'neukoelln', name: 'Neukölln' },
      store: { slug: 'neukoelln', name: 'Grocery Neukölln' },
    });
  });

  it('says "not served" for a well-formed postcode outside the areas', async () => {
    const { res, data } = await lookup('80331');
    expect(res.status).toBe(200);
    expect(data).toEqual({ postcode: '80331', served: false });
  });

  it.each(['1011', 'abcde', '101155'])('rejects the malformed code %s with 400', async (code) => {
    const res = await request(app).get(`/api/v1/delivery/postcodes/${code}`);
    expect(res.status).toBe(400);
  });

  it('does not serve a postcode of an inactive area', async () => {
    await db.update(deliveryAreas).set({ active: false }).where(eq(deliveryAreas.slug, 'mitte'));
    clearDeliveryCache();
    expect((await lookup('10115')).data.served).toBe(false);
    expect((await lookup('12045')).data.served).toBe(true);
  });
});

describe('GET /delivery/areas', () => {
  it('lists the four areas with their store and postcodes', async () => {
    const res = await request(app).get('/api/v1/delivery/areas');
    const areas = bodyOf<{ data: DeliveryArea[] }>(res).data;
    expect(areas.map((a) => a.slug)).toEqual([
      'kreuzberg-friedrichshain',
      'mitte',
      'neukoelln',
      'prenzlauer-berg',
    ]);
    const mitte = areas.find((a) => a.slug === 'mitte')!;
    expect(mitte.store).toMatchObject({ slug: 'mitte', postalCode: '10119' });
    expect(mitte.postcodes).toContain('10115');
    expect(res.headers['cache-control']).toContain('max-age');
  });

  it('gives every postcode to exactly one area', async () => {
    const all = AREA_SEEDS.flatMap((a) => a.postcodes);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(30);
    expect((await db.select().from(postcodes)).length).toBe(all.length);
    expect((await db.select().from(darkStores)).length).toBe(4);
  });
});

// The middleware is exercised through a bare request/response pair: it only needs to set the
// context for what runs after it.
async function contextFor(header: string | undefined) {
  const req = { get: (n: string) => (n.toLowerCase() === 'x-postcode' ? header : undefined) };
  const res = { vary: () => res };
  return new Promise<ReturnType<typeof currentDelivery>>((resolve, reject) => {
    void deliveryContext(req as unknown as Request, res as unknown as Response, (err?: unknown) =>
      err ? reject(new Error('middleware failed', { cause: err })) : resolve(currentDelivery()),
    );
  });
}

describe('deliveryContext', () => {
  it('resolves a served postcode to its area and store', async () => {
    const ctx = await contextFor('12043');
    expect(ctx).toMatchObject({
      postcode: '12043',
      served: true,
      area: { slug: 'neukoelln' },
      storeId: AREA_SEEDS[3]!.storeId,
    });
  });

  it.each([undefined, '', 'junk', '80331'])('falls back to the default store for %j', async (h) => {
    const ctx = await contextFor(h);
    expect(ctx).toEqual({ postcode: null, served: false, area: null, storeId: DEFAULT_STORE_ID });
  });

  it('is cached: the table is read once until the cache is cleared', async () => {
    expect((await lookupPostcode('10115'))?.storeSlug).toBe('mitte');
    await db.delete(postcodes).where(eq(postcodes.code, '10115'));
    expect((await lookupPostcode('10115'))?.storeSlug).toBe('mitte');
    clearDeliveryCache();
    expect(await lookupPostcode('10115')).toBeUndefined();
  });
});
