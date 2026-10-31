import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { cartItems, inventory, productVariants, products } from '../../db/schema/index.ts';
import { createCart, createProduct } from '../../test/factories.ts';

import { addItem, getCart, updateItem } from './service.ts';

async function cartWith(variantId: string, quantity: number) {
  const { cart } = await createCart({ items: [{ variantId, quantity }] });
  return cart.id;
}

const rowsOf = (cartId: string) => db.select().from(cartItems).where(eq(cartItems.cartId, cartId));

describe('getCart', () => {
  it('returns an empty, calm cart', async () => {
    const { cart } = await createCart();
    expect(await getCart(cart.id)).toEqual({
      items: [],
      currency: 'EUR',
      subtotalCents: 0,
      itemCount: 0,
      weightGrams: 0,
      warnings: [],
    });
  });

  it('prices lines from the catalog and totals them', async () => {
    const { variants: a } = await createProduct({
      name: 'Tug Rope',
      variants: [{ name: 'Red · L', priceCents: 1250, weightGrams: 300 }],
    });
    const { variants: b } = await createProduct({
      variants: [{ priceCents: 499, weightGrams: 100 }],
    });
    const { cart } = await createCart({
      items: [
        { variantId: a[0]!.id, quantity: 2 },
        { variantId: b[0]!.id, quantity: 3 },
      ],
    });

    const result = await getCart(cart.id);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      productName: 'Tug Rope',
      variantName: 'Red · L',
      unitPriceCents: 1250,
      quantity: 2,
      lineTotalCents: 2500,
      available: 50,
      maxQty: 50,
    });
    expect(result.subtotalCents).toBe(2500 + 1497);
    expect(result.itemCount).toBe(5);
    expect(result.weightGrams).toBe(2 * 300 + 3 * 100);
    expect(result.warnings).toEqual([]);
  });

  it('re-prices on every read: a price change shows up immediately', async () => {
    const { variants } = await createProduct({ variants: [{ priceCents: 1000 }] });
    const variant = variants[0]!;
    const cartId = await cartWith(variant.id, 2);
    expect((await getCart(cartId)).subtotalCents).toBe(2000);

    await db
      .update(productVariants)
      .set({ priceCents: 1300 })
      .where(eq(productVariants.id, variant.id));
    const after = await getCart(cartId);
    expect(after.items[0]?.unitPriceCents).toBe(1300);
    expect(after.subtotalCents).toBe(2600);
  });

  it('computes available as quantity minus reserved and caps maxQty at 99', async () => {
    const { variants } = await createProduct({
      variants: [{ stock: 20, reserved: 5 }, { stock: 500 }],
    });
    const { cart } = await createCart({
      items: [
        { variantId: variants[0]!.id, quantity: 1 },
        { variantId: variants[1]!.id, quantity: 1 },
      ],
    });
    const items = (await getCart(cart.id)).items;
    expect(items[0]).toMatchObject({ available: 15, maxQty: 15 });
    expect(items[1]).toMatchObject({ available: 500, maxQty: 99 });
  });

  describe('warnings', () => {
    it('OUT_OF_STOCK: keeps the line but leaves it out of every total', async () => {
      const { variants } = await createProduct({
        name: 'Sold Out Ball',
        variants: [{ stock: 0 }, { priceCents: 700 }],
      });
      const { cart } = await createCart({
        items: [
          { variantId: variants[0]!.id, quantity: 2 },
          { variantId: variants[1]!.id, quantity: 1 },
        ],
      });
      const result = await getCart(cart.id);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({ available: 0, maxQty: 0, quantity: 2 });
      expect(result.warnings).toEqual([
        {
          code: 'OUT_OF_STOCK',
          variantId: variants[0]!.id,
          productName: 'Sold Out Ball',
          variantName: 'Variant 1',
        },
      ]);
      expect(result.subtotalCents).toBe(700);
      expect(result.itemCount).toBe(1);
      expect(await rowsOf(cart.id)).toHaveLength(2);
    });

    it('OUT_OF_STOCK also when everything left is reserved', async () => {
      const { variants } = await createProduct({ variants: [{ stock: 4, reserved: 4 }] });
      const cartId = await cartWith(variants[0]!.id, 1);
      expect((await getCart(cartId)).warnings.map((w) => w.code)).toEqual(['OUT_OF_STOCK']);
    });

    it('QTY_REDUCED: clamps the response and persists the clamp, warning once', async () => {
      const { variants } = await createProduct({ variants: [{ stock: 10 }] });
      const variant = variants[0]!;
      const cartId = await cartWith(variant.id, 8);
      await db.update(inventory).set({ quantity: 3 }).where(eq(inventory.variantId, variant.id));

      const first = await getCart(cartId);
      expect(first.items[0]?.quantity).toBe(3);
      expect(first.warnings).toMatchObject([
        { code: 'QTY_REDUCED', variantId: variant.id, previousQuantity: 8, quantity: 3 },
      ]);
      expect((await rowsOf(cartId))[0]?.quantity).toBe(3);

      const second = await getCart(cartId);
      expect(second.warnings).toEqual([]);
      expect(second.subtotalCents).toBe(3 * 1000);
    });

    it('PRICE_CHANGED: warns once with old and new price, then remembers the new one', async () => {
      const { variants } = await createProduct({
        name: 'Tug Rope',
        variants: [{ priceCents: 1000 }],
      });
      const variant = variants[0]!;
      const { cart } = await createCart({
        items: [{ variantId: variant.id, quantity: 2, lastSeenPriceCents: 1000 }],
      });
      await db
        .update(productVariants)
        .set({ priceCents: 1200 })
        .where(eq(productVariants.id, variant.id));

      const first = await getCart(cart.id);
      expect(first.warnings).toEqual([
        {
          code: 'PRICE_CHANGED',
          variantId: variant.id,
          productName: 'Tug Rope',
          variantName: 'Variant 1',
          previousUnitPriceCents: 1000,
          unitPriceCents: 1200,
        },
      ]);
      // The charge basis is still the catalog price, never the remembered one.
      expect(first.subtotalCents).toBe(2400);
      expect((await rowsOf(cart.id))[0]?.lastSeenPriceCents).toBe(1200);
      expect((await getCart(cart.id)).warnings).toEqual([]);
    });

    it('PRICE_CHANGED: also warns when the price went down', async () => {
      const { variants } = await createProduct({ variants: [{ priceCents: 1000 }] });
      const { cart } = await createCart({
        items: [{ variantId: variants[0]!.id, quantity: 1, lastSeenPriceCents: 1000 }],
      });
      await db
        .update(productVariants)
        .set({ priceCents: 800 })
        .where(eq(productVariants.id, variants[0]!.id));
      expect((await getCart(cart.id)).warnings).toMatchObject([
        { code: 'PRICE_CHANGED', previousUnitPriceCents: 1000, unitPriceCents: 800 },
      ]);
    });

    it('PRICE_CHANGED: stays quiet for a line that never had a remembered price', async () => {
      const { variants } = await createProduct({ variants: [{ priceCents: 1000 }] });
      const cartId = await cartWith(variants[0]!.id, 1);
      expect((await getCart(cartId)).warnings).toEqual([]);
      expect((await rowsOf(cartId))[0]?.lastSeenPriceCents).toBe(1000);
    });

    it('PRICE_CHANGED: adding and changing quantity record the price the shopper sees', async () => {
      const { variants } = await createProduct({ variants: [{ priceCents: 1000 }] });
      const variant = variants[0]!;
      const { cart } = await createCart();

      await addItem(cart.id, variant.id, 1);
      const [line] = await rowsOf(cart.id);
      expect(line?.lastSeenPriceCents).toBe(1000);

      await db
        .update(productVariants)
        .set({ priceCents: 1500 })
        .where(eq(productVariants.id, variant.id));
      const after = await updateItem(cart.id, line!.id, 3);
      // The shopper just acted on the line at today's price, so there is nothing stale to warn about.
      expect(after.warnings).toEqual([]);
      expect((await rowsOf(cart.id))[0]?.lastSeenPriceCents).toBe(1500);
    });

    it('VARIANT_UNAVAILABLE: removes an archived variant and says so', async () => {
      const { variants } = await createProduct({ variants: [{}, {}] });
      const { cart } = await createCart({
        items: [
          { variantId: variants[0]!.id, quantity: 1 },
          { variantId: variants[1]!.id, quantity: 1 },
        ],
      });
      await db
        .update(productVariants)
        .set({ status: 'archived' })
        .where(eq(productVariants.id, variants[0]!.id));

      const result = await getCart(cart.id);
      expect(result.items.map((i) => i.variantId)).toEqual([variants[1]!.id]);
      expect(result.warnings).toMatchObject([
        { code: 'VARIANT_UNAVAILABLE', variantId: variants[0]!.id },
      ]);
      expect(await rowsOf(cart.id)).toHaveLength(1);
      expect((await getCart(cart.id)).warnings).toEqual([]);
    });

    it.each(['archived', 'draft'] as const)(
      'VARIANT_UNAVAILABLE: removes the line when its product is %s',
      async (status) => {
        const { product, variants } = await createProduct();
        const cartId = await cartWith(variants[0]!.id, 1);
        await db.update(products).set({ status }).where(eq(products.id, product.id));

        const result = await getCart(cartId);
        expect(result.items).toEqual([]);
        expect(result.warnings.map((w) => w.code)).toEqual(['VARIANT_UNAVAILABLE']);
        expect(await rowsOf(cartId)).toEqual([]);
      },
    );
  });

  describe('images', () => {
    it("prefers the variant's own image, then a product image, then none", async () => {
      const withBoth = await createProduct({
        variants: [{}, {}],
        images: [
          { url: '/general.webp', alt: 'general' },
          { url: '/red.webp', alt: 'red', variantIndex: 0, sortOrder: 5 },
        ],
      });
      const bare = await createProduct();
      const { cart } = await createCart({
        items: [
          { variantId: withBoth.variants[0]!.id, quantity: 1 },
          { variantId: withBoth.variants[1]!.id, quantity: 1 },
          { variantId: bare.variants[0]!.id, quantity: 1 },
        ],
      });
      const items = (await getCart(cart.id)).items;
      const imageOf = (variantId: string) => items.find((i) => i.variantId === variantId);
      expect(imageOf(withBoth.variants[0]!.id)?.imageUrl).toBe('/red.webp');
      expect(imageOf(withBoth.variants[1]!.id)?.imageUrl).toBe('/general.webp');
      expect(imageOf(bare.variants[0]!.id)).toMatchObject({ imageUrl: null, imageAlt: null });
    });
  });

  it('only ever returns the lines of the cart it was asked for', async () => {
    const { variants } = await createProduct();
    const mine = await cartWith(variants[0]!.id, 1);
    await cartWith(variants[0]!.id, 7);
    expect((await getCart(mine)).itemCount).toBe(1);
  });
});
