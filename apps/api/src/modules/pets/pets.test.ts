import { MAX_PETS } from '@store/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client.ts';
import { pets } from '../../db/schema/index.ts';
import { makeTestApp, TEST_ORIGIN } from '../../test/app.ts';
import { createUser } from '../../test/factories.ts';
import { bodyOf, errorOf } from '../../test/http.ts';
import { createSession } from '../auth/sessions.ts';

const app = makeTestApp();

async function signedIn() {
  const user = await createUser();
  const { token } = await createSession(user.id);
  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) => {
    const req = request(app)[method](`/api/v1${path}`).set('Cookie', `sid=${token}`);
    if (method !== 'get') req.set('Origin', TEST_ORIGIN);
    return body ? req.send(body) : req;
  };
  return { user, call };
}

type PetBody = { data: { id: string; name: string; species: string; birthday: string | null } };
const one = (res: request.Response) => bodyOf<PetBody>(res).data;
const list = (res: request.Response) => bodyOf<{ data: PetBody['data'][] }>(res).data;

describe('pet profiles', () => {
  it.each([
    ['get', '/account/pets'],
    ['post', '/account/pets'],
    ['post', '/account/pets/merge'],
    ['patch', '/account/pets/11111111-1111-4111-8111-111111111111'],
    ['delete', '/account/pets/11111111-1111-4111-8111-111111111111'],
  ] as const)('answers 401 to an anonymous %s %s', async (method, path) => {
    const res = await request(app)[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN).send({});
    expect(res.status).toBe(401);
  });

  it('creates, lists, updates and deletes a pet', async () => {
    const { call } = await signedIn();
    const created = await call('post', '/account/pets', {
      name: ' Biscuit ',
      species: 'dog',
      birthday: '2024-03-18',
      size: 'm',
    });
    expect(created.status).toBe(201);
    expect(one(created)).toMatchObject({ name: 'Biscuit', species: 'dog', birthday: '2024-03-18' });

    expect(list(await call('get', '/account/pets'))).toHaveLength(1);

    const patched = await call('patch', `/account/pets/${one(created).id}`, {
      name: 'Biscuit II',
      birthday: null,
      approxAgeMonths: 30,
    });
    expect(one(patched)).toMatchObject({ name: 'Biscuit II', birthday: null });

    expect((await call('delete', `/account/pets/${one(created).id}`)).status).toBe(204);
    expect(list(await call('get', '/account/pets'))).toHaveLength(0);
  });

  it('answers 404 for another user’s pet, whatever the method, and changes nothing', async () => {
    const owner = await signedIn();
    const other = await signedIn();
    const pet = one(await owner.call('post', '/account/pets', { name: 'Mine', species: 'cat' }));

    const patch = await other.call('patch', `/account/pets/${pet.id}`, { name: 'Stolen' });
    expect(patch.status).toBe(404);
    expect(errorOf(patch).code).toBe('NOT_FOUND');
    expect((await other.call('delete', `/account/pets/${pet.id}`)).status).toBe(404);

    const [row] = await db.select().from(pets).where(eq(pets.id, pet.id));
    expect(row?.name).toBe('Mine');
    expect(list(await other.call('get', '/account/pets'))).toEqual([]);
  });

  it('rejects the ninth pet and counts per user', async () => {
    const { call } = await signedIn();
    for (let i = 0; i < MAX_PETS; i += 1) {
      expect(
        (await call('post', '/account/pets', { name: `Pet ${i}`, species: 'fish' })).status,
      ).toBe(201);
    }
    const ninth = await call('post', '/account/pets', { name: 'Too many', species: 'fish' });
    expect(ninth.status).toBe(409);
    expect(errorOf(ninth).code).toBe('CONFLICT');

    const other = await signedIn();
    expect(
      (await other.call('post', '/account/pets', { name: 'Fine', species: 'bird' })).status,
    ).toBe(201);
  });

  it('holds the limit when requests race', async () => {
    const { call } = await signedIn();
    const results = await Promise.all(
      Array.from({ length: MAX_PETS + 3 }, (_, i) =>
        call('post', '/account/pets', { name: `Racer ${i}`, species: 'small' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(MAX_PETS);
    expect(list(await call('get', '/account/pets'))).toHaveLength(MAX_PETS);
  });

  it('rejects a birthday in the future, a bad species and an empty patch', async () => {
    const { call } = await signedIn();
    const future = await call('post', '/account/pets', {
      name: 'Time traveller',
      species: 'dog',
      birthday: '2999-01-01',
    });
    expect(future.status).toBe(400);
    expect((await call('post', '/account/pets', { name: 'Neddy', species: 'horse' })).status).toBe(
      400,
    );
    const pet = one(await call('post', '/account/pets', { name: 'Ok', species: 'dog' }));
    expect((await call('patch', `/account/pets/${pet.id}`, {})).status).toBe(400);
  });

  it('stores the birthday as a plain date, with no time-zone shift', async () => {
    const { call } = await signedIn();
    const pet = one(
      await call('post', '/account/pets', { name: 'Leap', species: 'cat', birthday: '2024-02-29' }),
    );
    expect(pet.birthday).toBe('2024-02-29');
  });
});

describe('POST /account/pets/merge', () => {
  it('adds the guest pets, skipping name+species the account already has', async () => {
    const { call } = await signedIn();
    await call('post', '/account/pets', { name: 'Biscuit', species: 'dog' });
    const res = await call('post', '/account/pets/merge', {
      pets: [
        { name: 'biscuit', species: 'dog' },
        { name: 'Biscuit', species: 'cat' },
        { name: 'Nemo', species: 'fish' },
        { name: 'NEMO', species: 'fish' },
      ],
    });
    expect(res.status).toBe(200);
    expect(
      list(res)
        .map((p) => `${p.name}:${p.species}`)
        .sort(),
    ).toEqual(['Biscuit:cat', 'Biscuit:dog', 'Nemo:fish']);
  });

  it('keeps what fits under the limit instead of failing', async () => {
    const { call } = await signedIn();
    const incoming = Array.from({ length: MAX_PETS }, (_, i) => ({
      name: `G${i}`,
      species: 'bird',
    }));
    await call('post', '/account/pets', { name: 'First', species: 'dog' });
    await call('post', '/account/pets', { name: 'Second', species: 'dog' });
    const res = await call('post', '/account/pets/merge', { pets: incoming });
    expect(res.status).toBe(200);
    expect(list(res)).toHaveLength(MAX_PETS);
  });

  it('rejects more than eight guest pets and invalid pets', async () => {
    const { call } = await signedIn();
    const nine = Array.from({ length: MAX_PETS + 1 }, (_, i) => ({
      name: `G${i}`,
      species: 'bird',
    }));
    expect((await call('post', '/account/pets/merge', { pets: nine })).status).toBe(400);
    expect(
      (await call('post', '/account/pets/merge', { pets: [{ name: 'X', species: 'horse' }] }))
        .status,
    ).toBe(400);
  });
});
