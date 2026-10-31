import type { Request } from 'express';

// The actor string written to history and adjustment rows: `admin:<email>`, same prefix convention
// as `system:webhook`. Reads `req.user`, which `requireAdmin` guarantees on every admin route.
export function adminActor(req: Request): string {
  if (!req.user) throw new Error('requireAdmin let an anonymous request through');
  return `admin:${req.user.email}`;
}
