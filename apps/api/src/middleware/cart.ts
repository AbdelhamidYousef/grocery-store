import type { Request, RequestHandler } from 'express';

import { readGuestCartId, setCartCookie } from '../lib/cookies.ts';
import { resolveCartIdentity } from '../modules/cart/identity.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the only way to extend Express's Request
  namespace Express {
    interface Request {
      /** The caller's own cart. Set by `withCart`; read it with `cartIdOf`. */
      cartId?: string;
    }
  }
}

// Finds (or lazily creates) the caller's cart and puts its id on `req.cartId`. It is applied to
// the cart routes only, not globally: most visitors are bots and browsers that never touch the
// cart, and a database row per visitor would fill the table with empty carts for nothing.
// Needs `attachUser` to have run first.
export const withCart: RequestHandler = async (req, res, next) => {
  const { cartId, createdGuestCart } = await resolveCartIdentity({
    userId: req.user?.id ?? null,
    guestCartId: readGuestCartId(req),
  });
  if (createdGuestCart) setCartCookie(res, cartId);
  req.cartId = cartId;
  next();
};

export function cartIdOf(req: Request): string {
  if (!req.cartId) throw new Error('withCart must run before this handler');
  return req.cartId;
}
