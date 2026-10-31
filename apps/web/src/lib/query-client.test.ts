import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/client';

import { CATALOG_STALE_MS, createQueryClient, keys, shouldRetry } from './query-client';

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
});
