// Background work the app starts on its own (the email outbox is kicked fire-and-forget after a
// webhook commits) must not still be running when the next test truncates the tables: the
// drain's row locks and the truncate's table lock wait for each other and Postgres aborts one
// with "deadlock detected". Coverage instrumentation slows tests enough to hit it reliably.
// `trackPending` records such work; the global afterEach in setup.ts awaits it.
const pending = new Set<Promise<unknown>>();

export function trackPending(work: Promise<unknown>): void {
  const settled = work.then(
    () => undefined,
    () => undefined,
  );
  pending.add(settled);
  void settled.then(() => pending.delete(settled));
}

export async function settlePending(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
