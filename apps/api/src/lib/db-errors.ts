// Postgres reports a violated unique index as SQLSTATE 23505 with the constraint's name. Drizzle
// wraps the driver error (`cause`), so look through the chain. Returns the constraint name, or
// undefined when the error is something else.
export function uniqueViolation(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth++) {
    const e = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (e.code === '23505') {
      return typeof e.constraint_name === 'string' ? e.constraint_name : '';
    }
    current = e.cause;
  }
  return undefined;
}
