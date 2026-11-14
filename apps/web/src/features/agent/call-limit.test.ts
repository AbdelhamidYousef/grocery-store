import { describe, expect, it } from 'vitest';

import { createCallLimiter } from './call-limit';

describe('createCallLimiter', () => {
  it('allows the cap, then says how long to wait', () => {
    let t = 1000;
    const limiter = createCallLimiter(3, 60_000, () => t);
    expect([limiter.take(), limiter.take(), limiter.take()]).toEqual([0, 0, 0]);
    t += 10_000;
    expect(limiter.take()).toBe(50);
  });

  it('frees a slot when the oldest call leaves the window', () => {
    let t = 0;
    const limiter = createCallLimiter(2, 60_000, () => t);
    limiter.take();
    t = 30_000;
    limiter.take();
    expect(limiter.take()).toBeGreaterThan(0);
    t = 60_000;
    expect(limiter.take()).toBe(0);
  });

  it('does not count a refused call', () => {
    let t = 0;
    const limiter = createCallLimiter(1, 1000, () => t);
    limiter.take();
    limiter.take();
    limiter.take();
    t = 1000;
    expect(limiter.take()).toBe(0);
  });
});
