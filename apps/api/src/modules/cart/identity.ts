import type { Tx } from '../../db/client.ts';

import * as repo from './repo.ts';

const DAY_MS = 24 * 3600 * 1000;
// Guests get a shorter life than accounts: an anonymous cart is a smaller promise.
export const GUEST_CART_TTL_MS = 30 * DAY_MS;
export const USER_CART_TTL_MS = 90 * DAY_MS;

export const guestExpiry = () => new Date(Date.now() + GUEST_CART_TTL_MS);
export const userExpiry = () => new Date(Date.now() + USER_CART_TTL_MS);

// The signed-in user's one active cart, created on first need. An active cart that has expired is
// retired as `abandoned` first (the partial unique index allows only one active cart per user, so
// a stale one would otherwise block the new one).
export async function getOrCreateUserCart(userId: string, run?: Tx): Promise<repo.CartRow> {
  const existing = await repo.findActiveUserCart(userId, run);
  if (existing && existing.expiresAt > new Date()) return existing;
  if (existing) await repo.markStatus(existing.id, 'abandoned', run);

  const created = await repo.insertUserCartIfAbsent(userId, userExpiry(), run);
  if (created) return created;
  // Lost a race against a concurrent request: the winner's cart is the one to use.
  const winner = await repo.findActiveUserCart(userId, run);
  if (!winner) throw new Error('active cart vanished during creation');
  return winner;
}

export interface CartIdentity {
  cartId: string;
  /** True when a brand new guest cart was made, so the caller must set the cookie. */
  createdGuestCart: boolean;
}

// Who owns the cart for this request is decided here and only here, from the session or from the
// signed cookie, never from a client-supplied id in a body or URL. That is what makes every later
// cart mutation safe from IDOR: the cart id it works on is always the caller's own.
export async function resolveCartIdentity(who: {
  userId: string | null;
  guestCartId: string | null;
}): Promise<CartIdentity> {
  const found = await findCartIdentity(who);
  if (found) return found;
  return { cartId: (await repo.insertGuestCart(guestExpiry())).id, createdGuestCart: true };
}

// The read-only half: the caller's cart if one exists, otherwise null and nothing is written.
// `GET /cart` uses this so a visitor who never adds anything (most of them, and every bot) never
// costs a row. A signed-in user still gets their one cart, because that row is bounded by the
// number of accounts, not by the number of visits.
export async function findCartIdentity(who: {
  userId: string | null;
  guestCartId: string | null;
}): Promise<CartIdentity | null> {
  if (who.userId) {
    // A signed-in user's guest cookie (left over from before login) is ignored here; the merge on
    // login is the only thing that moves guest items into an account.
    return { cartId: (await getOrCreateUserCart(who.userId)).id, createdGuestCart: false };
  }
  if (who.guestCartId) {
    const live = await repo.findLiveGuestCart(who.guestCartId);
    if (live) return { cartId: live.id, createdGuestCart: false };
  }
  return null;
}
