import type { LoginSchema, RegisterSchema } from '@store/shared';
import type { z } from 'zod';

import { conflict, unauthenticated } from '../../lib/errors.ts';

import { hash, verify, verifyAgainstDummy } from './password.ts';
import * as repo from './repo.ts';
import {
  createSession,
  deleteSession,
  purgeExpired,
  type AuthUser,
  type SessionMeta,
} from './sessions.ts';

const toAuthUser = (row: repo.UserRow): AuthUser => ({
  id: row.id,
  email: row.email,
  firstName: row.firstName,
  lastName: row.lastName,
  role: row.role,
});

interface Issued {
  user: AuthUser;
  token: string;
}

// Session fixation: if an attacker plants a known session id in the victim's browser and the app
// keeps it across login, the attacker is signed in too. So login and register never reuse a
// session: any session that arrived with the request is deleted and a brand new id is issued.
async function issueFreshSession(
  user: AuthUser,
  meta: SessionMeta,
  previousToken: string | null,
): Promise<Issued> {
  if (previousToken) await deleteSession(previousToken);
  // Cheap housekeeping on a rare, already-slow path (there is no cron on the free tier).
  await purgeExpired();
  const { token } = await createSession(user.id, meta);
  return { user, token };
}

export async function register(
  input: z.output<typeof RegisterSchema>,
  meta: SessionMeta,
  previousToken: string | null,
): Promise<Issued> {
  const row = await repo.insertUser({
    email: input.email,
    passwordHash: await hash(input.password),
    firstName: input.firstName,
    lastName: input.lastName,
  });
  // Registration may reveal that an email exists (the form has to say so, and the signup response
  // time already differs). Login, by contrast, must not: see below.
  if (!row) throw conflict(undefined, 'An account with this email already exists');
  return issueFreshSession(toAuthUser(row), meta, previousToken);
}

// One generic message for every credential failure, and one argon2 verification whichever way it
// fails (a dummy hash when the email is unknown), so neither the body nor the timing tells an
// attacker which emails have accounts.
export async function login(
  input: z.output<typeof LoginSchema>,
  meta: SessionMeta,
  previousToken: string | null,
): Promise<Issued> {
  const row = await repo.findUserByEmail(input.email);
  const ok = row
    ? await verify(row.passwordHash, input.password)
    : await verifyAgainstDummy(input.password);
  if (!row || !ok) throw unauthenticated('Invalid email or password');
  return issueFreshSession(toAuthUser(row), meta, previousToken);
}

export async function logout(token: string | null): Promise<void> {
  if (token) await deleteSession(token);
}
