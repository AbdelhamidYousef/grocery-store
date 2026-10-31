import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { addresses, orders, users } from '../../db/schema/index.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createUser } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { hash } from '../auth/password.ts';
import { createSession } from '../auth/sessions.ts';

const app = makeTestApp();

async function signedIn(overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(overrides);
  const { token } = await createSession(user.id);
  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) => {
    const req = request(app)[method](`/api/v1${path}`).set('Cookie', `sid=${token}`);
    if (method !== 'get') req.set('Origin', TEST_ORIGIN);
    return body ? req.send(body) : req;
  };
  return { user, token, call };
}

const home = {
  fullName: 'Ada Lovelace',
  line1: '1 Main Street',
  city: 'Berlin',
  postalCode: '10115',
  country: 'de',
};

type AddressBody = {
  data: { id: string; isDefaultShipping: boolean; isDefaultBilling: boolean; country: string };
};
const addressBody = (res: request.Response) => bodyOf<AddressBody>(res).data;

describe('account auth', () => {
  it.each([
    ['patch', '/account'],
    ['post', '/account/password'],
    ['get', '/account/addresses'],
    ['post', '/account/addresses'],
    ['patch', '/account/addresses/11111111-1111-4111-8111-111111111111'],
    ['delete', '/account/addresses/11111111-1111-4111-8111-111111111111'],
    ['get', '/account/orders'],
  ] as const)('answers 401 to an anonymous %s %s', async (method, path) => {
    const res = await request(app)[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN).send({});
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });
});

describe('PATCH /account', () => {
  it('updates the names and returns the user', async () => {
    const { call } = await signedIn();
    const res = await call('patch', '/account', { firstName: ' Grace ', lastName: 'Hopper' });
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: { user: object } }>(res).data.user).toMatchObject({
      firstName: 'Grace',
      lastName: 'Hopper',
    });
  });

  it('changes only the fields that were sent', async () => {
    const { call, user } = await signedIn({ lastName: 'Keep' });
    await call('patch', '/account', { firstName: 'New' });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ firstName: 'New', lastName: 'Keep' });
  });

  it('ignores attempts to change email or role (mass assignment)', async () => {
    const { call, user } = await signedIn();
    const res = await call('patch', '/account', {
      firstName: 'X',
      email: 'new@pawsome.test',
      role: 'admin',
    });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ email: user.email, role: 'customer' });
  });

  it('rejects an empty update and a blank name', async () => {
    const { call } = await signedIn();
    expect((await call('patch', '/account', {})).status).toBe(400);
    expect((await call('patch', '/account', { firstName: '  ' })).status).toBe(400);
  });
});

describe('POST /account/password', () => {
  const oldPassword = 'old password for testing';
  const newPassword = 'a brand new passphrase';

  it('changes the password, keeps this session and revokes the others', async () => {
    const me = await signedIn({ passwordHash: await hash(oldPassword) });
    const other = await createSession(me.user.id);

    const res = await me.call('post', '/account/password', {
      currentPassword: oldPassword,
      newPassword,
    });
    expect(res.status).toBe(204);

    expect((await me.call('get', '/auth/me')).status).toBe(200);
    const otherRes = await request(app).get('/api/v1/auth/me').set('Cookie', `sid=${other.token}`);
    expect(otherRes.status).toBe(401);

    const login = (password: string) =>
      request(app)
        .post('/api/v1/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: me.user.email, password });
    expect((await login(newPassword)).status).toBe(200);
    expect((await login(oldPassword)).status).toBe(401);
  });

  it('answers a wrong current password with a field error, not 401', async () => {
    const me = await signedIn({ passwordHash: await hash(oldPassword) });
    const res = await me.call('post', '/account/password', {
      currentPassword: 'not it at all',
      newPassword,
    });
    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(errorOf(res).details)).toContain('currentPassword');
    // Nothing changed: the session still works and the old password still verifies.
    expect((await me.call('get', '/auth/me')).status).toBe(200);
  });

  it('rejects a weak, common or unchanged new password', async () => {
    const me = await signedIn({ passwordHash: await hash(oldPassword) });
    for (const candidate of ['short', 'password123', oldPassword]) {
      const res = await me.call('post', '/account/password', {
        currentPassword: oldPassword,
        newPassword: candidate,
      });
      expect(res.status).toBe(400);
    }
  });

  it('is rate-limited like login', async () => {
    const limited = makeTestApp({ config: { authRateLimit: { windowMs: 60_000, limit: 2 } } });
    const user = await createUser();
    const { token } = await createSession(user.id);
    const attempt = () =>
      request(limited)
        .post('/api/v1/account/password')
        .set('Cookie', `sid=${token}`)
        .set('Origin', TEST_ORIGIN)
        .send({ currentPassword: 'wrong', newPassword });
    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(429);
  });
});

describe('addresses', () => {
  it('makes the first address the default for both kinds and normalises input', async () => {
    const { call } = await signedIn();
    const res = await call('post', '/account/addresses', {
      ...home,
      label: '',
      line2: '  ',
      phone: null,
    });
    expect(res.status).toBe(201);
    expect(addressBody(res)).toMatchObject({
      country: 'DE',
      label: null,
      line2: null,
      phone: null,
      isDefaultShipping: true,
      isDefaultBilling: true,
    });
  });

  it('does not make later addresses the default', async () => {
    const { call } = await signedIn();
    await call('post', '/account/addresses', home);
    const second = await call('post', '/account/addresses', { ...home, line1: '2 Side Street' });
    expect(addressBody(second)).toMatchObject({
      isDefaultShipping: false,
      isDefaultBilling: false,
    });
  });

  it('moves the default when a new address asks for it, keeping one per kind', async () => {
    const { call, user } = await signedIn();
    const first = addressBody(await call('post', '/account/addresses', home));
    const second = addressBody(
      await call('post', '/account/addresses', { ...home, isDefaultShipping: true }),
    );

    expect(second).toMatchObject({ isDefaultShipping: true, isDefaultBilling: false });
    const rows = await db.select().from(addresses).where(eq(addresses.userId, user.id));
    expect(rows.find((r) => r.id === first.id)).toMatchObject({
      isDefaultShipping: false,
      isDefaultBilling: true,
    });
  });

  it('demotes the old default when an update promotes another address', async () => {
    const { call } = await signedIn();
    const first = addressBody(await call('post', '/account/addresses', home));
    const second = addressBody(await call('post', '/account/addresses', { ...home, city: 'Köln' }));

    const res = await call('patch', `/account/addresses/${second.id}`, {
      isDefaultShipping: true,
      isDefaultBilling: true,
    });
    expect(addressBody(res)).toMatchObject({ isDefaultShipping: true, isDefaultBilling: true });

    const list = bodyOf<{ data: AddressBody['data'][] }>(await call('get', '/account/addresses'));
    expect(list.data.map((a) => a.id)).toEqual([second.id, first.id]);
    expect(list.data[1]).toMatchObject({ isDefaultShipping: false, isDefaultBilling: false });
  });

  it('updates only the sent fields and can clear an optional one', async () => {
    const { call } = await signedIn();
    const created = addressBody(
      await call('post', '/account/addresses', { ...home, phone: '123' }),
    );
    const res = await call('patch', `/account/addresses/${created.id}`, {
      city: 'Hamburg',
      phone: '',
    });
    expect(res.status).toBe(200);
    expect(bodyOf<{ data: object }>(res).data).toMatchObject({
      city: 'Hamburg',
      phone: null,
      line1: home.line1,
    });
  });

  it('survives two simultaneous "make default" requests (user row lock)', async () => {
    const { call, user } = await signedIn();
    const a = addressBody(await call('post', '/account/addresses', home));
    const b = addressBody(await call('post', '/account/addresses', { ...home, city: 'B' }));
    const c = addressBody(await call('post', '/account/addresses', { ...home, city: 'C' }));
    const results = await Promise.all([
      call('patch', `/account/addresses/${b.id}`, { isDefaultShipping: true }),
      call('patch', `/account/addresses/${c.id}`, { isDefaultShipping: true }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const rows = await db.select().from(addresses).where(eq(addresses.userId, user.id));
    expect(rows.filter((r) => r.isDefaultShipping)).toHaveLength(1);
    expect(a.id).toBeDefined();
  });

  it('deletes an address and leaves no default when the default goes', async () => {
    const { call } = await signedIn();
    const only = addressBody(await call('post', '/account/addresses', home));
    expect((await call('delete', `/account/addresses/${only.id}`)).status).toBe(204);
    expect(bodyOf<{ data: unknown[] }>(await call('get', '/account/addresses')).data).toEqual([]);
    expect((await call('delete', `/account/addresses/${only.id}`)).status).toBe(404);
  });

  it.each([
    ['a bad country', { country: 'Germany' }],
    ['a missing line1', { line1: '' }],
    ['an over-long postal code', { postalCode: '1'.repeat(30) }],
  ])('rejects %s', async (_label, patch) => {
    const { call } = await signedIn();
    const res = await call('post', '/account/addresses', { ...home, ...patch });
    expect(res.status).toBe(400);
  });

  it('rejects an id that is not a uuid before touching the database', async () => {
    const { call } = await signedIn();
    expect((await call('patch', '/account/addresses/not-a-uuid', { city: 'X' })).status).toBe(400);
  });
});

describe('address ownership (no IDOR)', () => {
  async function twoUsers() {
    const alice = await signedIn();
    const bob = await signedIn();
    const aliceAddress = addressBody(await alice.call('post', '/account/addresses', home));
    return { alice, bob, aliceAddress };
  }

  it("does not list another user's addresses", async () => {
    const { bob } = await twoUsers();
    expect(bodyOf<{ data: unknown[] }>(await bob.call('get', '/account/addresses')).data).toEqual(
      [],
    );
  });

  it("answers 404 when user B patches user A's address, and changes nothing", async () => {
    const { bob, aliceAddress } = await twoUsers();
    const res = await bob.call('patch', `/account/addresses/${aliceAddress.id}`, {
      city: 'Hacked',
      isDefaultShipping: true,
    });
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
    const [row] = await db.select().from(addresses).where(eq(addresses.id, aliceAddress.id));
    expect(row).toMatchObject({ city: 'Berlin', isDefaultShipping: true });
  });

  it("answers 404 when user B deletes user A's address, and it survives", async () => {
    const { bob, aliceAddress } = await twoUsers();
    const res = await bob.call('delete', `/account/addresses/${aliceAddress.id}`);
    expect(res.status).toBe(404);
    expect(await db.select().from(addresses).where(eq(addresses.id, aliceAddress.id))).toHaveLength(
      1,
    );
  });

  it("does not let a failed attempt on A's id demote B's own default", async () => {
    const { bob, aliceAddress } = await twoUsers();
    const own = addressBody(await bob.call('post', '/account/addresses', home));
    const res = await bob.call('patch', `/account/addresses/${aliceAddress.id}`, {
      isDefaultShipping: true,
    });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(addresses).where(eq(addresses.id, own.id));
    expect(row?.isDefaultShipping).toBe(true);
  });

  it('cannot be sidestepped by sending userId in the body', async () => {
    const { alice, bob } = await twoUsers();
    const res = await bob.call('post', '/account/addresses', { ...home, userId: alice.user.id });
    expect(res.status).toBe(201);
    const mine = await db.select().from(addresses).where(eq(addresses.userId, bob.user.id));
    expect(mine).toHaveLength(1);
  });
});

describe('GET /account/orders', () => {
  const order = (userId: string | null, status: 'paid' | 'pending_payment') => ({
    userId,
    email: 'x@pawsome.test',
    status,
    subtotalCents: 1000,
    shippingCents: 490,
    totalCents: 1490,
    shippingMethodCode: 'standard',
    shippingMethodName: 'Standard',
    shippingAddress: { fullName: 'A', line1: 'B', city: 'C', postalCode: '1', country: 'DE' },
    placedAt: status === 'paid' ? new Date() : null,
  });

  it('returns an empty paginated list for a new account', async () => {
    const { call } = await signedIn();
    const res = await call('get', '/account/orders');
    expect(res.status).toBe(200);
    expect(bodyOf(res)).toEqual({
      data: [],
      meta: { page: 1, limit: 24, total: 0, totalPages: 0 },
    });
  });

  it('lists only my placed orders, newest first', async () => {
    const me = await signedIn();
    const stranger = await createUser();
    await db
      .insert(orders)
      .values([
        order(me.user.id, 'paid'),
        order(me.user.id, 'pending_payment'),
        order(stranger.id, 'paid'),
        order(null, 'paid'),
      ]);
    const res = await me.call('get', '/account/orders');
    const body = bodyOf<{ data: { number: string; status: string }[]; meta: { total: number } }>(
      res,
    );
    expect(body.meta.total).toBe(1);
    expect(body.data.map((o) => o.status)).toEqual(['paid']);
  });
});
