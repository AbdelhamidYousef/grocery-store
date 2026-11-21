import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { wishlistItems, wishlists } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct, stockAt } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';
import { createSession } from '../auth/sessions.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(() => {
  app = makeTestApp();
});

type Summary = { id: string; name: string; isDefault: boolean; itemCount: number };
type Detail = Summary & {
  items: {
    id: string;
    productId: string;
    name: string;
    variantId: string | null;
    quantity: number;
    available: boolean;
  }[];
};
const data = <T>(res: { body: unknown }) => bodyOf<{ data: T }>(res as never).data;
type Customer = Awaited<ReturnType<typeof signedIn>>;
const lists = async (c: Customer) => data<Summary[]>(await c.shopper.call('get', '/me/lists'));
const make = async (c: Customer, name: string) => {
  const res = await c.shopper.call('post', '/me/lists', { name });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return data<Summary>(res);
};
const product = (name: string, stock = 20) =>
  createProduct({ name, variants: [{ priceCents: 800, stock }] });
const put = async (c: Customer, listId: string, productId: string, quantity = 1) => {
  const res = await c.shopper.call('put', `/me/lists/${listId}/items`, { productId, quantity });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return data<Detail>(res);
};

describe('shopping lists', () => {
  it('needs an account', async () => {
    const guest = makeShopper(app);
    expect((await guest.call('get', '/me/lists')).status).toBe(401);
    expect((await guest.call('post', '/me/lists', { name: 'x' })).status).toBe(401);
  });

  it('gives every account the default list "Saved", first, and creates it only once', async () => {
    const c = await signedIn(app);
    const first = await lists(c);
    expect(first).toEqual([
      expect.objectContaining({ name: 'Saved', isDefault: true, itemCount: 0 }),
    ]);
    await make(c, 'Weekly shop');
    await make(c, 'Party');
    const all = await lists(c);
    expect(all.map((l) => l.name)).toEqual(['Saved', 'Weekly shop', 'Party']);
    expect(all.filter((l) => l.isDefault)).toHaveLength(1);
  });

  it('names are 1 to 40 characters and unique per shopper, case aside; others may reuse them', async () => {
    const c = await signedIn(app);
    const other = await signedIn(app);
    await make(c, 'Weekly shop');
    const dup = await c.shopper.call('post', '/me/lists', { name: ' weekly SHOP ' });
    expect(dup.status).toBe(409);
    expect(errorOf(dup).message).toContain('already have a list');
    expect((await c.shopper.call('post', '/me/lists', { name: 'saved' })).status).toBe(409);
    expect((await c.shopper.call('post', '/me/lists', { name: '   ' })).status).toBe(400);
    expect((await c.shopper.call('post', '/me/lists', { name: 'x'.repeat(41) })).status).toBe(400);
    expect((await other.shopper.call('post', '/me/lists', { name: 'Weekly shop' })).status).toBe(
      201,
    );
  });

  it('holds at most 20 lists', async () => {
    const c = await signedIn(app);
    for (let i = 1; i < 20; i++) await make(c, `List ${i}`); // plus "Saved" = 20
    const res = await c.shopper.call('post', '/me/lists', { name: 'One too many' });
    expect(res.status).toBe(409);
    expect(await lists(c)).toHaveLength(20);
  });

  it("renames and deletes a named list, never the default one, and never somebody else's", async () => {
    const c = await signedIn(app);
    const other = await signedIn(app);
    const [saved] = await lists(c);
    const party = await make(c, 'Party');
    const renamed = await c.shopper.call('patch', `/me/lists/${party.id}`, { name: 'Birthday' });
    expect(data<Summary>(renamed).name).toBe('Birthday');
    expect((await c.shopper.call('patch', `/me/lists/${saved!.id}`, { name: 'Mine' })).status).toBe(
      409,
    );
    expect((await c.shopper.call('delete', `/me/lists/${saved!.id}`)).status).toBe(409);
    expect(
      (await other.shopper.call('patch', `/me/lists/${party.id}`, { name: 'Hijack' })).status,
    ).toBe(404);
    expect((await other.shopper.call('delete', `/me/lists/${party.id}`)).status).toBe(404);
    expect((await other.shopper.call('get', `/me/lists/${party.id}`)).status).toBe(404);
    expect((await c.shopper.call('delete', `/me/lists/${party.id}`)).status).toBe(204);
    expect((await lists(c)).map((l) => l.name)).toEqual(['Saved']);
  });

  it('keeps items with quantities; putting the same product again replaces the quantity', async () => {
    const c = await signedIn(app);
    const weekly = await make(c, 'Weekly shop');
    const milk = await product('Milk');
    const bread = await product('Bread');
    await put(c, weekly.id, milk.product.id, 2);
    await put(c, weekly.id, bread.product.id, 1);
    const again = await put(c, weekly.id, milk.product.id, 5);
    expect(again.items.map((i) => [i.name, i.quantity])).toEqual([
      ['Milk', 5],
      ['Bread', 1],
    ]);
    expect(again.itemCount).toBe(2);
    const itemId = again.items[0]!.id;
    const set = await c.shopper.call('patch', `/me/lists/${weekly.id}/items/${itemId}`, {
      quantity: 3,
    });
    expect(data<Detail>(set).items[0]).toMatchObject({ quantity: 3 });
    expect(
      (await c.shopper.call('patch', `/me/lists/${weekly.id}/items/${itemId}`, { quantity: 0 }))
        .status,
    ).toBe(400);
    expect(
      (await c.shopper.call('patch', `/me/lists/${weekly.id}/items/${itemId}`, { quantity: 100 }))
        .status,
    ).toBe(400);
    const removed = await c.shopper.call('delete', `/me/lists/${weekly.id}/items/${itemId}`);
    expect(data<Detail>(removed).items.map((i) => i.name)).toEqual(['Bread']);
  });

  it('refuses an unknown or archived product and a variant of another product', async () => {
    const c = await signedIn(app);
    const weekly = await make(c, 'Weekly shop');
    const a = await product('A');
    const b = await product('B');
    const gone = await createProduct({ status: 'archived', variants: [{ stock: 3 }] });
    const call = (body: object) => c.shopper.call('put', `/me/lists/${weekly.id}/items`, body);
    expect((await call({ productId: gone.product.id })).status).toBe(404);
    expect((await call({ productId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await call({ productId: a.product.id, variantId: b.variants[0]!.id })).status).toBe(
      404,
    );
  });
});

describe('the wishlist is the default list', () => {
  it('shows the wishlist items in "Saved" with quantity 1, and adds from the heart land there', async () => {
    const c = await signedIn(app);
    const milk = await product('Milk');
    const res = await c.shopper.call('post', '/wishlist/items', { productId: milk.product.id });
    expect(res.status).toBe(200);
    const [saved] = await lists(c);
    expect(saved).toMatchObject({ name: 'Saved', itemCount: 1 });
    const detail = data<Detail>(await c.shopper.call('get', `/me/lists/${saved!.id}`));
    expect(detail.items[0]).toMatchObject({ name: 'Milk', quantity: 1 });
  });

  it('lists items put on "Saved" are served by the old wishlist route too', async () => {
    const c = await signedIn(app);
    const bread = await product('Bread');
    const [saved] = await lists(c);
    await put(c, saved!.id, bread.product.id, 3);
    const old = await c.shopper.call('get', '/wishlist');
    expect(
      bodyOf<{ data: { items: { name: string; quantity: number }[] } }>(old).data.items,
    ).toEqual([expect.objectContaining({ name: 'Bread', quantity: 3 })]);
  });

  it('a named list never shows up in the wishlist, and the share link keeps working', async () => {
    const c = await signedIn(app);
    const milk = await product('Milk');
    const party = await make(c, 'Party');
    await put(c, party.id, milk.product.id, 4);
    expect(
      bodyOf<{ data: { items: unknown[] } }>(await c.shopper.call('get', '/wishlist')).data.items,
    ).toEqual([]);
    const bread = await product('Bread');
    await c.shopper.call('post', '/wishlist/items', { productId: bread.product.id });
    const shared = await c.shopper.call('post', '/wishlist/share');
    const token = bodyOf<{ data: { shareToken: string } }>(shared).data.shareToken;
    const view = await makeShopper(app).call('get', `/wishlist/shared/${token}`);
    expect(view.status).toBe(200);
    expect(
      bodyOf<{ data: { items: { name: string }[] } }>(view).data.items.map((i) => i.name),
    ).toEqual(['Bread']);
  });

  it('a share link made before lists existed still opens (the row kept its token)', async () => {
    const c = await signedIn(app);
    const bread = await product('Bread');
    await c.shopper.call('post', '/wishlist/items', { productId: bread.product.id });
    const shared = await c.shopper.call('post', '/wishlist/share');
    const token = bodyOf<{ data: { shareToken: string } }>(shared).data.shareToken;
    const rows = await db.select().from(wishlists).where(eq(wishlists.shareToken, token));
    expect(rows).toMatchObject([{ name: 'Saved', isDefault: true }]);
    expect((await makeShopper(app).call('get', `/wishlist/shared/${token}`)).status).toBe(200);
  });

  it('a guest list merges into "Saved" on login and keeps working', async () => {
    const guest = makeShopper(app);
    const milk = await product('Milk');
    await guest.call('post', '/wishlist/items', { productId: milk.product.id });
    const c = await signedIn(app);
    expect(c.user.id).toBeTruthy();
    const items = await db.select().from(wishlistItems);
    expect(items.every((i) => i.quantity === 1)).toBe(true);
  });
});

describe('add all to basket', () => {
  it('adds the lines in stock with their quantities and reports the rest with the reason', async () => {
    const c = await signedIn(app);
    const party = await make(c, 'Party');
    const crisps = await product('Crisps');
    const soda = await product('Soda');
    const gone = await product('Sold out', 0);
    await put(c, party.id, crisps.product.id, 3);
    await put(c, party.id, soda.product.id, 2);
    await put(c, party.id, gone.product.id, 1);
    const res = await c.shopper.call('post', `/me/lists/${party.id}/add-to-cart`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const out = data<{
      cart: { items: { productName: string; quantity: number }[] };
      added: { name: string; quantity: number }[];
      skipped: { name: string; reason: string }[];
    }>(res);
    expect(out.added.map((a) => [a.name, a.quantity])).toEqual([
      ['Crisps', 3],
      ['Soda', 2],
    ]);
    expect(out.skipped).toMatchObject([{ name: 'Sold out', reason: 'sold_out' }]);
    expect(out.cart.items.map((i) => [i.productName, i.quantity])).toEqual([
      ['Crisps', 3],
      ['Soda', 2],
    ]);
  });

  it('asks for more than the store has: that line is reported, the others still go in', async () => {
    const c = await signedIn(app);
    const party = await make(c, 'Party');
    const few = await product('Few left', 2);
    const plenty = await product('Plenty');
    await put(c, party.id, few.product.id, 5);
    await put(c, party.id, plenty.product.id, 1);
    const out = data<{ added: { name: string }[]; skipped: { name: string; reason: string }[] }>(
      await c.shopper.call('post', `/me/lists/${party.id}/add-to-cart`),
    );
    expect(out.added.map((a) => a.name)).toEqual(['Plenty']);
    expect(out.skipped).toMatchObject([{ name: 'Few left', reason: 'sold_out' }]);
  });

  it('follows the shopper postcode: what only the other store has is reported', async () => {
    const c = await signedIn(app);
    const party = await make(c, 'Party');
    const both = await product('Everywhere');
    const mitteOnly = await product('Mitte only');
    await stockAt(both.variants[0]!.id, 'neukoelln', 5);
    await put(c, party.id, both.product.id, 1);
    await put(c, party.id, mitteOnly.product.id, 1);
    const { token } = await createSession(c.user.id);
    const inNeukoelln = makeShopper(app, token, undefined, '12045');
    const out = data<{ added: { name: string }[]; skipped: { name: string; reason: string }[] }>(
      await inNeukoelln.call('post', `/me/lists/${party.id}/add-to-cart`),
    );
    expect(out.added.map((a) => a.name)).toEqual(['Everywhere']);
    expect(out.skipped).toMatchObject([{ name: 'Mitte only', reason: 'sold_out' }]);
  });

  it("is not available for somebody else's list", async () => {
    const c = await signedIn(app);
    const other = await signedIn(app);
    const party = await make(c, 'Party');
    expect((await other.shopper.call('post', `/me/lists/${party.id}/add-to-cart`)).status).toBe(
      404,
    );
  });
});
