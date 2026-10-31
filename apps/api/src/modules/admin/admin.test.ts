import { Writable } from 'node:stream';

import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { MemoryTransport } from '../../lib/mailer.ts';
import { makeTestApp } from '../../test/app.ts';
import { FakeStripe } from '../../test/fake-stripe.ts';
import { errorOf, bodyOf } from '../../test/http.ts';
import { signedIn } from '../../test/orders.ts';
import { listRoutes } from '../../test/routes.ts';
import { makeShopper } from '../../test/shopper.ts';
import { createOutbox } from '../mail/outbox.ts';

import { createAdminRouter } from './router.ts';

const app = makeTestApp();

// Concrete values for path params, so a route like /admin/orders/:number can actually be called.
const fill = (path: string) =>
  path
    .replace(':number', 'PW-2026-000001')
    .replace(/:\w*[iI]d\b/g, '11111111-1111-4111-8111-111111111111');

describe('admin guard: every admin route', () => {
  // Discovered from the router, not typed by hand, so a route added in a later step is covered
  // the moment it exists. Mounted under /admin by createAdminRouter.
  const routes = listRoutes(
    createAdminRouter({
      payments: new FakeStripe(),
      outbox: createOutbox({ transport: new MemoryTransport(), log: pino({ level: 'silent' }) }),
    }),
  ).filter((r) => r.path.length > 0);

  it('has routes to test (the discovery itself works)', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some((r) => r.method === 'get' && r.path === '/stats')).toBe(true);
  });

  it.each(routes.map((r) => [r.method, r.path] as const))(
    '%s /admin%s answers 401 to a guest and 403 to a customer',
    async (method, path) => {
      const url = `/admin${fill(path)}`;
      const guest = await makeShopper(app).call(method, url, method === 'get' ? undefined : {});
      expect(guest.status).toBe(401);
      expect(errorOf(guest).code).toBe('UNAUTHENTICATED');

      const customer = await signedIn(app, 'customer');
      const res = await customer.shopper.call(method, url, method === 'get' ? undefined : {});
      expect(res.status).toBe(403);
      expect(errorOf(res).code).toBe('FORBIDDEN');
    },
  );
});

describe('GET /admin/stats', () => {
  it('lets an admin in and returns the dashboard numbers', async () => {
    const admin = await signedIn(app, 'admin');
    const res = await admin.shopper.call('get', '/admin/stats');
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toEqual({
      data: { ordersToday: 0, revenue30dCents: 0, currency: 'EUR', lowStockCount: 0 },
    });
  });
});

describe('admin audit log', () => {
  function capturing() {
    const lines: Record<string, unknown>[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        cb();
      },
    });
    return { lines, logger: pino({ level: 'info' }, stream) };
  }

  it('writes one line per admin mutation with request id, user id and action, and none for reads', async () => {
    const { lines, logger } = capturing();
    const logged = makeTestApp({ logger });
    const admin = await signedIn(logged, 'admin');

    await admin.shopper.call('get', '/admin/stats');
    // A mutation on a route that does not exist yet still passes the guard and gets audited (404).
    const res = await admin.shopper.call('post', '/admin/does-not-exist', {});
    const audit = lines.filter((l) => l.audit === true);

    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      userId: admin.user.id,
      requestId: res.headers['x-request-id'],
      status: 404,
      msg: 'admin action',
    });
    expect(typeof audit[0]?.action).toBe('string');
  });

  it('does not audit what the guard refused: a customer never reaches the admin code', async () => {
    const { lines, logger } = capturing();
    const logged = makeTestApp({ logger });
    const customer = await signedIn(logged, 'customer');
    await customer.shopper.call('post', '/admin/anything', {});
    expect(lines.some((l) => l.audit === true)).toBe(false);
  });
});
