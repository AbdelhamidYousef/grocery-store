// A client-side cap on agent tool calls: a sliding window, 30 per minute. It is a courtesy to the
// shopper's session and the API, not a security boundary (an agent in the page could bypass any
// client code): the real limits (auth, CSRF origin check, stock and trial rules, the API's global
// rate limit) still apply on the server, unchanged.
export const AGENT_CALLS_PER_MINUTE = 30;

export interface CallLimiter {
  /** Records a call and returns 0, or returns the whole seconds to wait when over the cap. */
  take: () => number;
}

export function createCallLimiter(
  max = AGENT_CALLS_PER_MINUTE,
  windowMs = 60_000,
  now: () => number = Date.now,
): CallLimiter {
  const calls: number[] = [];
  return {
    take() {
      const t = now();
      while (calls.length > 0 && t - (calls[0] ?? t) >= windowMs) calls.shift();
      if (calls.length >= max) {
        const oldest = calls[0] ?? t;
        return Math.max(1, Math.ceil((oldest + windowMs - t) / 1000));
      }
      calls.push(t);
      return 0;
    },
  };
}
