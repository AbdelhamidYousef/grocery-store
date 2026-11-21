import {
  PICK_STATUSES,
  SUBSTITUTION_PREFERENCES,
  SWAP_STATUSES,
  type SubstituteOption,
} from '@store/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, beforeEach } from 'vitest';

import { db } from '../../db/client.ts';
import {
  cartItems,
  orderItems,
  pickStatus,
  substitutionPreference,
  swapStatus,
} from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createCategory, createProduct, createShippingMethods } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { placeOrder, signedIn } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

const app = makeTestApp();
beforeEach(createShippingMethods);

interface CartBody {
  data: {
    items: {
      id: string;
      variantId: string;
      substitution: string;
      substitute: { variantId: string } | null;
    }[];
  };
}

describe('enums', () => {
  it('match the shared lists', () => {
    expect(substitutionPreference.enumValues).toEqual([...SUBSTITUTION_PREFERENCES]);
    expect(pickStatus.enumValues).toEqual([...PICK_STATUSES]);
    expect(swapStatus.enumValues).toEqual([...SWAP_STATUSES]);
  });
});

// A yoghurt (milk, vegetarian) and neighbours in the same subcategory.
async function yoghurtShelf() {
  const category = await createCategory();
  const make = (
    name: string,
    priceCents: number,
    allergens: string[],
    dietary: string[],
    stock = 10,
  ) =>
    createProduct({
      name,
      categoryId: category.id,
      shelfLifeDays: 10,
      food: { allergens, dietary },
      variants: [{ priceCents, stock }],
    });
  const original = await make('Greek yoghurt', 200, ['milk'], ['vegetarian']);
  const close = await make('Natural yoghurt', 210, ['milk'], ['vegetarian']);
  const withNuts = await make('Nut yoghurt', 200, ['milk', 'nuts'], ['vegetarian']);
  const notVeg = await make('Gelatine yoghurt', 200, ['milk'], []);
  const pricey = await make('Skyr deluxe', 400, ['milk'], ['vegetarian']);
  const gone = await make('Sold out yoghurt', 205, ['milk'], ['vegetarian'], 0);
  const other = await createProduct({ name: 'Cheese', variants: [{ priceCents: 200 }] });
  return { original, close, withNuts, notVeg, pricey, gone, other };
}

describe('GET /products/:slug/substitutes', () => {
  it('lists only safe, same-subcategory, in-band, in-stock products', async () => {
    const s = await yoghurtShelf();
    const res = await makeShopper(app).call(
      'get',
      `/products/${s.original.product.slug}/substitutes`,
    );
    expect(res.status).toBe(200);
    const options = bodyOf<{ data: SubstituteOption[] }>(res).data;
    expect(options.map((o) => o.productName)).toEqual(['Natural yoghurt']);
    expect(options[0]).toMatchObject({ unitPriceCents: 210, variantId: s.close.variants[0]!.id });
  });

  it('404s an unknown product', async () => {
    const res = await makeShopper(app).call('get', '/products/nope/substitutes');
    expect(res.status).toBe(404);
  });
});

describe('the choice on a cart line', () => {
  it('starts as best match and can be changed to refund it', async () => {
    const s = await yoghurtShelf();
    const shopper = makeShopper(app);
    await shopper.addToCart(s.original.variants[0]!.id, 2);
    const cart = bodyOf<CartBody>(await shopper.call('get', '/cart')).data;
    expect(cart.items[0]).toMatchObject({ substitution: 'best_match', substitute: null });
    const res = await shopper.call('put', `/cart/items/${cart.items[0]!.id}/substitution`, {
      substitution: 'none',
    });
    expect(res.status).toBe(200);
    expect(bodyOf<CartBody>(res).data.items[0]!.substitution).toBe('none');
  });

  it('accepts a product from the best-match list and refuses any other', async () => {
    const s = await yoghurtShelf();
    const shopper = makeShopper(app);
    await shopper.addToCart(s.original.variants[0]!.id);
    const line = bodyOf<CartBody>(await shopper.call('get', '/cart')).data.items[0]!;
    const url = `/cart/items/${line.id}/substitution`;

    const ok = await shopper.call('put', url, {
      substitution: 'specific',
      substituteVariantId: s.close.variants[0]!.id,
    });
    expect(ok.status).toBe(200);
    expect(bodyOf<CartBody>(ok).data.items[0]).toMatchObject({
      substitution: 'specific',
      substitute: { variantId: s.close.variants[0]!.id },
    });

    for (const unsafe of [s.withNuts, s.notVeg, s.pricey, s.gone, s.other]) {
      const bad = await shopper.call('put', url, {
        substitution: 'specific',
        substituteVariantId: unsafe.variants[0]!.id,
      });
      expect(bad.status, unsafe.product.name).toBe(422);
    }
    // "specific" without a product, and a product without "specific", are both malformed.
    expect((await shopper.call('put', url, { substitution: 'specific' })).status).toBe(400);
    expect(
      (
        await shopper.call('put', url, {
          substitution: 'none',
          substituteVariantId: s.close.variants[0]!.id,
        })
      ).status,
    ).toBe(400);
  });

  it('"apply to all" sets every line and clears specific choices', async () => {
    const s = await yoghurtShelf();
    const shopper = makeShopper(app);
    await shopper.addToCart(s.original.variants[0]!.id);
    await shopper.addToCart(s.other.variants[0]!.id);
    const lines = bodyOf<CartBody>(await shopper.call('get', '/cart')).data.items;
    await shopper.call('put', `/cart/items/${lines[0]!.id}/substitution`, {
      substitution: 'specific',
      substituteVariantId: s.close.variants[0]!.id,
    });
    const res = await shopper.call('put', '/cart/substitution', { substitution: 'none' });
    expect(bodyOf<CartBody>(res).data.items.map((i) => [i.substitution, i.substitute])).toEqual([
      ['none', null],
      ['none', null],
    ]);
    expect(
      (await shopper.call('put', '/cart/substitution', { substitution: 'specific' })).status,
    ).toBe(400);
    const rows = await db.select().from(cartItems);
    expect(rows.every((r) => r.substituteVariantId === null)).toBe(true);
  });

  it("another shopper's line is not found", async () => {
    const s = await yoghurtShelf();
    const mine = makeShopper(app);
    await mine.addToCart(s.original.variants[0]!.id);
    const line = bodyOf<CartBody>(await mine.call('get', '/cart')).data.items[0]!;
    const theirs = makeShopper(app);
    await theirs.addToCart(s.other.variants[0]!.id);
    const res = await theirs.call('put', `/cart/items/${line.id}/substitution`, {
      substitution: 'none',
    });
    expect(res.status).toBe(404);
  });
});

describe('the account default', () => {
  it('needs an account, defaults to best match and is applied to new lines', async () => {
    expect((await makeShopper(app).call('get', '/account/substitution')).status).toBe(401);
    const { shopper } = await signedIn(app);
    const first = await shopper.call('get', '/account/substitution');
    expect(bodyOf<{ data: { defaultSubstitution: string } }>(first).data.defaultSubstitution).toBe(
      'best_match',
    );
    expect(
      (await shopper.call('put', '/account/substitution', { defaultSubstitution: 'none' })).status,
    ).toBe(200);
    expect(
      (await shopper.call('put', '/account/substitution', { defaultSubstitution: 'specific' }))
        .status,
    ).toBe(400);

    const s = await yoghurtShelf();
    await shopper.addToCart(s.original.variants[0]!.id);
    const line = bodyOf<CartBody>(await shopper.call('get', '/cart')).data.items[0]!;
    expect(line.substitution).toBe('none');
  });

  it('is kept when a guest cart is merged into the account', async () => {
    const s = await yoghurtShelf();
    const guest = makeShopper(app);
    await guest.addToCart(s.original.variants[0]!.id);
    const line = bodyOf<CartBody>(await guest.call('get', '/cart')).data.items[0]!;
    await guest.call('put', `/cart/items/${line.id}/substitution`, { substitution: 'none' });
    const email = 'merge@grocery.test';
    const reg = await guest.call('post', '/auth/register', {
      email,
      password: 'correct-horse-battery-1',
      firstName: 'Mia',
      lastName: 'Merge',
    });
    expect(reg.status).toBeLessThan(300);
    const cart = bodyOf<CartBody>(await guest.call('get', '/cart')).data;
    expect(cart.items[0]!.substitution).toBe('none');
  });
});

describe('at checkout', () => {
  it('copies the choice to the order line', async () => {
    const s = await yoghurtShelf();
    const shopper = makeShopper(app);
    await shopper.addToCart(s.original.variants[0]!.id);
    const line = bodyOf<CartBody>(await shopper.call('get', '/cart')).data.items[0]!;
    await shopper.call('put', `/cart/items/${line.id}/substitution`, {
      substitution: 'specific',
      substituteVariantId: s.close.variants[0]!.id,
    });
    await placeOrder(app, { variantId: s.original.variants[0]!.id, shopper });
    const rows = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.variantId, s.original.variants[0]!.id));
    expect(rows[0]).toMatchObject({
      substitution: 'specific',
      substituteVariantId: s.close.variants[0]!.id,
    });
  });
});
