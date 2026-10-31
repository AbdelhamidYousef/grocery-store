import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '../../db/client.ts';
import { cartItems, carts } from '../../db/schema/index.ts';
import { createCart, createProduct, createUser } from '../../test/factories.ts';

// The merge must be all-or-nothing. To prove it, make the second line's insert blow up, as a
// database error half way through a real merge would, and check that nothing from the first line
// survived either.
const failure = vi.hoisted(() => ({ onInsertNumber: 0, calls: 0 }));

vi.mock('./repo.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./repo.ts')>();
  return {
    ...real,
    insertItem: (...args: Parameters<typeof real.insertItem>) => {
      failure.calls += 1;
      if (failure.calls === failure.onInsertNumber) throw new Error('simulated database failure');
      return real.insertItem(...args);
    },
  };
});

const { mergeGuestCart } = await import('./service.ts');

describe('mergeGuestCart atomicity', () => {
  it('leaves both carts untouched when it fails half way', async () => {
    const a = await createProduct();
    const b = await createProduct();
    const user = await createUser();
    const { cart: guest } = await createCart({
      items: [
        { variantId: a.variants[0]!.id, quantity: 1 },
        { variantId: b.variants[0]!.id, quantity: 1 },
      ],
    });
    failure.calls = 0;
    failure.onInsertNumber = 2; // the second line's insert fails

    await expect(mergeGuestCart(guest.id, user.id)).rejects.toThrow('simulated database failure');

    // Nothing was added to the user (not even the first line, not even their cart row)...
    expect(await db.select().from(carts).where(eq(carts.userId, user.id))).toEqual([]);
    expect(await db.select().from(cartItems).where(eq(cartItems.cartId, guest.id))).toHaveLength(2);
    // ...and the guest cart is still a live guest cart, ready for the retry.
    const [row] = await db.select().from(carts).where(eq(carts.id, guest.id));
    expect(row?.status).toBe('active');

    failure.onInsertNumber = 0;
    expect(await mergeGuestCart(guest.id, user.id)).toMatchObject({ merged: 2 });
  });
});
