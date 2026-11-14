import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { wishlistItems, wishlists } from '../../db/schema/index.ts';
import { makeTestApp } from '../../test/app.ts';
import { createProduct } from '../../test/factories.ts';
import { bodyOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { makeShopper } from '../../test/shopper.ts';

let app: ReturnType<typeof makeTestApp>;
beforeEach(() => {
  app = makeTestApp();
});

type Item = { id: string; productId: string; name: string; available: boolean; priceCents: number };
type Body = { data: { items: Item[]; shareToken: string | null } };
const listOf = (res: { body: unknown }) => (res.body as Body).data;

const product = (opts: { stock?: number; name?: string } = {}) =>
  createProduct({
    ...(opts.name && { name: opts.name }),
    variants: [{ priceCents: 1800, stock: opts.stock ?? 5 }],
  });

describe('the wishlist', () => {
  it('a read never creates a list; the first add creates a guest list and a cookie', async () => {
    const guest = makeShopper(app);
    expect(listOf(await guest.call('get', '/wishlist')).items).toEqual([]);
    expect(await db.select().from(wishlists)).toHaveLength(0);
    const { product: p } = await product();
    const res = await guest.call('post', '/wishlist/items', { productId: p.id });
    expect(res.status).toBe(200);
    expect(guest.jar.has('wishlist_id')).toBe(true);
    expect(listOf(res).items[0]).toMatchObject({
      productId: p.id,
      available: true,
      priceCents: 1800,
    });
    expect(await db.select().from(wishlists)).toHaveLength(1);
  });

  it('adding the same product twice keeps one row; removing deletes it', async () => {
    const c = await signedIn(app);
    const { product: p } = await product();
    await c.shopper.call('post', '/wishlist/items', { productId: p.id });
    const again = await c.shopper.call('post', '/wishlist/items', { productId: p.id });
    expect(listOf(again).items).toHaveLength(1);
    const del = await c.shopper.call('delete', `/wishlist/items/${listOf(again).items[0]!.id}`);
    expect(listOf(del).items).toHaveLength(0);
  });

  it('shows a sold-out product as unavailable and hides an archived one', async () => {
    const c = await signedIn(app);
    const { product: soldOut } = await product({ stock: 0 });
    const { product: gone } = await createProduct({
      status: 'archived',
      variants: [{ priceCents: 500, stock: 3 }],
    });
    await c.shopper.call('post', '/wishlist/items', { productId: soldOut.id });
    // an archived product cannot be added, but one archived later disappears from the list
    expect((await c.shopper.call('post', '/wishlist/items', { productId: gone.id })).status).toBe(
      404,
    );
    const items = listOf(await c.shopper.call('get', '/wishlist')).items;
    expect(items).toHaveLength(1);
    expect(items[0]!.available).toBe(false);
  });

  it('rejects an unknown product and a variant of another product', async () => {
    const c = await signedIn(app);
    const a = await product();
    const b = await product();
    expect(
      (
        await c.shopper.call('post', '/wishlist/items', {
          productId: '00000000-0000-4000-8000-000000000000',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await c.shopper.call('post', '/wishlist/items', {
          productId: a.product.id,
          variantId: b.variants[0]!.id,
        })
      ).status,
    ).toBe(404);
  });

  it("a guest cannot reach a signed-in user's list through a cookie", async () => {
    const c = await signedIn(app);
    const { product: p } = await product();
    await c.shopper.call('post', '/wishlist/items', { productId: p.id });
    const [list] = await db.select().from(wishlists);
    const thief = makeShopper(app);
    thief.jar.set('wishlist_id', list!.id); // unsigned: ignored
    expect(listOf(await thief.call('get', '/wishlist')).items).toEqual([]);
  });
});

describe('merging on login', () => {
  const PASSWORD = 'correct-horse-battery';
  const login = (shopper: ReturnType<typeof makeShopper>, email: string) =>
    shopper.call('post', '/auth/login', { email, password: PASSWORD });

  it('moves guest items into the account list without duplicates, and drops the guest list', async () => {
    const a = await product({ name: 'A' });
    const b = await product({ name: 'B' });
    // an account that already had A
    const member = makeShopper(app);
    const reg = await member.call('post', '/auth/register', {
      email: 'merge@grocery.test',
      password: PASSWORD,
      firstName: 'Mo',
      lastName: 'Merge',
    });
    expect(reg.status).toBe(201);
    await member.call('post', '/wishlist/items', { productId: a.product.id });
    await member.call('post', '/auth/logout');

    const guest = makeShopper(app);
    await guest.call('post', '/wishlist/items', { productId: a.product.id });
    await guest.call('post', '/wishlist/items', { productId: b.product.id });
    expect(await db.select().from(wishlists)).toHaveLength(2);
    expect((await login(guest, 'merge@grocery.test')).status).toBe(200);
    const list = listOf(await guest.call('get', '/wishlist'));
    expect(list.items.map((i) => i.name).sort()).toEqual(['A', 'B']);
    expect(guest.jar.has('wishlist_id')).toBe(false);
    const rows = await db.select().from(wishlists);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).not.toBeNull();
    expect(
      await db.select().from(wishlistItems).where(eq(wishlistItems.wishlistId, rows[0]!.id)),
    ).toHaveLength(2);
  });
});

describe('sharing', () => {
  it('needs an account, shows first name and items, and revoking kills the link', async () => {
    const guest = makeShopper(app);
    expect((await guest.call('post', '/wishlist/share')).status).toBe(401);

    const c = await signedIn(app);
    const { product: p } = await product({ name: 'Squeaky bone' });
    await c.shopper.call('post', '/wishlist/items', { productId: p.id });
    const anon = makeShopper(app);
    // not shared yet: unknown token
    expect((await anon.call('get', `/wishlist/shared/${'t'.repeat(30)}`)).status).toBe(404);

    const shared = listOf(await c.shopper.call('post', '/wishlist/share'));
    expect(shared.shareToken).toMatch(/^[\w-]{16,}$/);
    const again = listOf(await c.shopper.call('post', '/wishlist/share'));
    expect(again.shareToken).toBe(shared.shareToken); // stable while on

    const view = await anon.call('get', `/wishlist/shared/${shared.shareToken}`);
    expect(view.status).toBe(200);
    const data = bodyOf<{ data: { ownerFirstName: string; items: Item[] } }>(view).data;
    expect(data.items[0]!.name).toBe('Squeaky bone');
    expect(data.ownerFirstName).toBe(c.user.firstName);
    expect(JSON.stringify(data)).not.toContain(c.user.email);
    expect(JSON.stringify(data)).not.toContain(c.user.lastName);

    await c.shopper.call('delete', '/wishlist/share');
    expect((await anon.call('get', `/wishlist/shared/${shared.shareToken}`)).status).toBe(404);
    // turning it on again makes a NEW token: the old link stays dead
    const next = listOf(await c.shopper.call('post', '/wishlist/share'));
    expect(next.shareToken).not.toBe(shared.shareToken);
  });
});
