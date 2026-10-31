import { afterEach, describe, expect, it, vi } from 'vitest';

import { track } from './track';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('track', () => {
  it('logs the event in development', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.stubEnv('DEV', true);
    track({ name: 'view_home' });
    expect(spy).toHaveBeenCalledWith('[track]', 'view_home', { name: 'view_home' });
  });

  it('does nothing in production', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.stubEnv('DEV', false);
    track({ name: 'view_home' });
    expect(spy).not.toHaveBeenCalled();
  });
});
