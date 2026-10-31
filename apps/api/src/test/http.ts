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

// The raw `Set-Cookie` line for one cookie name, so tests can assert its flags.
export function setCookieLine(res: Response, name: string): string | undefined {
  const lines = (res.headers['set-cookie'] ?? []) as string[] | string;
  return [lines].flat().find((line) => line.startsWith(`${name}=`));
}

// The value a browser would send back for that cookie ('' once it has been cleared).
export function cookieValue(res: Response, name: string): string | undefined {
  const line = setCookieLine(res, name);
  return line?.split(';')[0]?.slice(name.length + 1);
}
