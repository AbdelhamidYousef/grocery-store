import { ErrorCode } from '@store/shared';
import { isStoreCode } from '@store/shared';
import type { z } from 'zod';

import { postcodeHeader } from '../lib/postcode';

// The one place that calls fetch. Components never do (SSR guard-rail), and every response is
// parsed with the shared Zod schema the API itself validated against, so a drifting API shape
// fails loudly here instead of becoming `undefined is not a function` three components later.

// Empty in dev (the Vite proxy forwards /api, same origin so cookies just work). In production
// the web and API live on different origins, but Vercel rewrites /api/* too, so this stays empty
// there as well; VITE_API_URL exists for builds that talk to an API directly.
// The store view comes from the page's URL prefix (`/de-de/...`), read per request: the prefix is
// fixed for the life of a page load (switching store reloads). The API answers catalogue reads in
// that store's language; the admin has no prefix and so reads English.
export function storeViewHeader(): Record<string, string> {
  const code = window.location.pathname.split('/')[1] ?? '';
  return isStoreCode(code) ? { 'X-Store-View': code } : {};
}

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export type ApiErrorCode = ErrorCode | 'NETWORK' | 'BAD_RESPONSE';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiFetchOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  schema: S;
  signal?: AbortSignal;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ErrorCode;
}

export async function apiFetch<S extends z.ZodType>(
  path: string,
  { method = 'GET', body, schema, signal }: ApiFetchOptions<S>,
): Promise<z.output<S>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      // Sends the session and cart cookies (phases 6-7); harmless for public catalog calls.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...storeViewHeader(),
        // The delivery postcode the shopper chose: it picks the dark store whose stock is shown.
        ...postcodeHeader(),
        // A FormData body (photo upload) must NOT get a Content-Type from us: the browser adds
        // `multipart/form-data` together with the boundary it generated.
        ...(body === undefined || body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    // An abort is the caller's decision (React Query cancels stale requests); pass it through.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('NETWORK', 0, 'Could not reach the server', cause);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Empty or non-JSON body: handled below depending on the status.
  }

  if (!res.ok) {
    const err = (
      json as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null
    )?.error;
    throw new ApiError(
      isErrorCode(err?.code) ? err.code : ErrorCode.INTERNAL,
      res.status,
      typeof err?.message === 'string' ? err.message : `Request failed with status ${res.status}`,
      err?.details,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('BAD_RESPONSE', res.status, 'The server sent an unexpected response', {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}
