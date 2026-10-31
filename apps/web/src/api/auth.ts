import { UserResponseSchema, type LoginInput, type RegisterInput, type User } from '@store/shared';
import { z } from 'zod';

import { ApiError, apiFetch } from './client';

// 204 responses have no body, which apiFetch reads as null.
export const NoContentSchema = z.null();

// The boot call: a 401 here is the normal answer for a visitor, not an error, so it becomes null.
export async function fetchMe(signal?: AbortSignal): Promise<User | null> {
  try {
    const res = await apiFetch('/auth/me', {
      schema: UserResponseSchema,
      ...(signal && { signal }),
    });
    return res.data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function login(input: LoginInput): Promise<User> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: input,
    schema: UserResponseSchema,
  });
  return res.data.user;
}

export async function register(input: RegisterInput): Promise<User> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: input,
    schema: UserResponseSchema,
  });
  return res.data.user;
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST', schema: NoContentSchema });
}
