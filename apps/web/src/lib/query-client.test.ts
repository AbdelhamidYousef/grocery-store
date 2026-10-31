import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/client';

import {
  CATALOG_STALE_MS,
  createQueryClient,
  handleUnauthenticated,
  keys,
  shouldRetry,
} from './query-client';

describe('query client', () => {
  it('treats catalog data as fresh for a minute', () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(CATALOG_STALE_MS);
  });

  it('retries server errors and network failures, but never client errors', () => {
    expect(shouldRetry(0, new ApiError('INTERNAL', 503, 'down'))).toBe(true);
    expect(shouldRetry(0, new ApiError('NETWORK', 0, 'offline'))).toBe(true);
    expect(shouldRetry(0, new ApiError('NOT_FOUND', 404, 'missing'))).toBe(false);
    expect(shouldRetry(2, new ApiError('INTERNAL', 500, 'down'))).toBe(false);
  });

  it('gives different list params different cache keys', () => {
    expect(keys.products.list({ page: 1 })).not.toEqual(keys.products.list({ page: 2 }));
    expect(keys.products.list({ page: 1 })).toEqual(keys.products.list({ page: 1 }));
  });

  describe('an expired session', () => {
    const user = {
      id: 'u1',
      email: 'sam@example.test',
      firstName: 'Sam',
      lastName: 'R',
      role: 'customer',
    };

    it('signs the page out and flags why, when a 401 arrives for a signed-in shopper', () => {
      const client = createQueryClient();
      client.setQueryData(keys.me, user);
      client.setQueryData(keys.cart, { items: [{ id: 'l1' }] });
      handleUnauthenticated(client, new ApiError('UNAUTHENTICATED', 401, 'Sign in required'));
      expect(client.getQueryData(keys.me)).toBeNull();
      expect(client.getQueryData(keys.sessionExpired)).toBe(true);
      // The cart has its own cookie and must survive.
      expect(client.getQueryData(keys.cart)).toEqual({ items: [{ id: 'l1' }] });
    });

    it('ignores a 401 when nobody looked signed in (a wrong password is just a failed attempt)', () => {
      const client = createQueryClient();
      client.setQueryData(keys.me, null);
      handleUnauthenticated(
        client,
        new ApiError('UNAUTHENTICATED', 401, 'Invalid email or password'),
      );
      expect(client.getQueryData(keys.sessionExpired)).toBeUndefined();
    });

    it('ignores other failures, including a 403 or a dropped connection', () => {
      const client = createQueryClient();
      client.setQueryData(keys.me, user);
      handleUnauthenticated(client, new ApiError('FORBIDDEN', 403, 'No'));
      handleUnauthenticated(client, new ApiError('NETWORK', 0, 'offline'));
      handleUnauthenticated(client, new Error('boom'));
      expect(client.getQueryData(keys.me)).toEqual(user);
    });
  });
});
