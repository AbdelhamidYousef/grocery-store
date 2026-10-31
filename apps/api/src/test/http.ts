import type { Response } from 'supertest';

// Supertest types `res.body` as `any`, which the strict lint rules (rightly) refuse to touch.
// These helpers are the single place that asserts a shape, so tests stay readable and `any`-free.
export function bodyOf<T = Record<string, unknown>>(res: Response): T {
  return res.body as T;
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function errorOf(res: Response): ErrorBody['error'] {
  return bodyOf<ErrorBody>(res).error;
}
